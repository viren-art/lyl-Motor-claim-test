/**
 * Questions Service Tests
 * Tests for Thai-friendly clarifying questions generation
 */

const request = require('supertest');
const app = require('../../../src/app');
const db = require('../../../src/database/connection');
const nock = require('nock');

describe('Questions Service', () => {
  let testClaimId;
  
  beforeAll(async () => {
    // Create test claim with missing fields
    const result = await db.pool.query(
      `INSERT INTO claims 
       (claim_id, policy_number, language, narrative, injuries_reported, 
        police_report_filed, missing_fields, claim_context, status, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
       RETURNING claim_id`,
      [
        'clm_test_questions_001',
        '1234567890',
        'th',
        'รถชนกันที่แยกสุขุมวิท มีคนบาดเจ็บ',
        true,
        true,
        JSON.stringify([
          { field: 'vehicles[0].licensePlate', criticality: 'CRITICAL', reason: 'Required for claim processing' },
          { field: 'incidentLocation', criticality: 'CRITICAL', reason: 'Exact location needed' },
          { field: 'policeReportNumber', criticality: 'HIGH', reason: 'Police report filed but number missing' }
        ]),
        JSON.stringify({ narrative: 'รถชนกันที่แยกสุขุมวิท มีคนบาดเจ็บ' }),
        'INTAKE'
      ]
    );
    testClaimId = result.rows[0].claim_id;
  });
  
  afterAll(async () => {
    // Clean up test data
    await db.pool.query('DELETE FROM clarifying_questions WHERE claim_id = $1', [testClaimId]);
    await db.pool.query('DELETE FROM claims WHERE claim_id = $1', [testClaimId]);
    await db.pool.end();
  });
  
  describe('POST /api/v1/claims/:claimId/questions/generate', () => {
    it('TC-014: should generate exactly 3 Thai-friendly questions for missing fields', async () => {
      // Mock LLM service response
      nock('http://localhost:8000')
        .post('/api/v1/questions/generate')
        .reply(200, {
          claim_id: testClaimId,
          questions: [
            {
              question_th: 'ทะเบียนรถของคุณคืออะไรครับ/ค่ะ?',
              question_en: 'What is your vehicle license plate number?',
              field: 'vehicles[0].licensePlate',
              generation_rationale: 'Critical field for claim processing'
            },
            {
              question_th: 'เกิดเหตุที่ไหนครับ/ค่ะ? (ถนน/แยก/จังหวัด)',
              question_en: 'Where did the accident occur? (street/intersection/province)',
              field: 'incidentLocation',
              generation_rationale: 'Exact location needed for coverage validation'
            },
            {
              question_th: 'มีเลขที่รายงานตำรวจไหมครับ/ค่ะ?',
              question_en: 'Do you have a police report number?',
              field: 'policeReportNumber',
              generation_rationale: 'Police report filed but number missing'
            }
          ],
          processing_time_ms: 1200,
          llm_model_version: 'gpt-4'
        });
      
      const response = await request(app)
        .post(`/api/v1/claims/${testClaimId}/questions/generate`)
        .expect(200);
      
      expect(response.body.claimId).toBe(testClaimId);
      expect(response.body.questions).toHaveLength(3);
      expect(response.body.questions[0].question_th).toContain('ทะเบียนรถ');
      expect(response.body.questions[0].question_en).toContain('license plate');
      expect(response.body.processingTimeMs).toBeLessThan(30000);
      
      // Verify questions stored in database
      const dbResult = await db.pool.query(
        'SELECT COUNT(*) as count FROM clarifying_questions WHERE claim_id = $1',
        [testClaimId]
      );
      expect(parseInt(dbResult.rows[0].count)).toBe(3);
    });
    
    it('should use conversational Thai phrasing with ครับ/ค่ะ particles', async () => {
      nock('http://localhost:8000')
        .post('/api/v1/questions/generate')
        .reply(200, {
          claim_id: testClaimId,
          questions: [
            {
              question_th: 'รถของคุณยี่ห้ออะไรครับ/ค่ะ? (เช่น Toyota, Honda)',
              question_en: 'What is your vehicle make? (e.g., Toyota, Honda)',
              field: 'vehicles[0].make',
              generation_rationale: 'Vehicle identification'
            },
            {
              question_th: 'เกิดอุบัติเหตุเมื่อไหร่ครับ/ค่ะ? (วันที่และเวลา)',
              question_en: 'When did the accident happen? (date and time)',
              field: 'incidentDate',
              generation_rationale: 'Incident timing'
            },
            {
              question_th: 'รถเสียหายตรงไหนบ้างครับ/ค่ะ?',
              question_en: 'Which parts are damaged?',
              field: 'vehicles[0].damageDescription',
              generation_rationale: 'Damage assessment'
            }
          ],
          processing_time_ms: 1100,
          llm_model_version: 'gpt-4'
        });
      
      const response = await request(app)
        .post(`/api/v1/claims/${testClaimId}/questions/generate`)
        .expect(200);
      
      // Verify conversational Thai phrasing
      response.body.questions.forEach(q => {
        expect(q.question_th).toMatch(/ครับ\/ค่ะ/);
        expect(q.question_th.length).toBeLessThan(100); // Short and simple
      });
    });
    
    it('should return 404 for non-existent claim', async () => {
      const response = await request(app)
        .post('/api/v1/claims/clm_nonexistent/questions/generate')
        .expect(404);
      
      expect(response.body.title).toBe('Claim Not Found');
    });
    
    it('should return 400 when no missing fields exist', async () => {
      // Create claim with no missing fields
      const completeClaimResult = await db.pool.query(
        `INSERT INTO claims 
         (claim_id, policy_number, language, narrative, missing_fields, status, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, NOW())
         RETURNING claim_id`,
        ['clm_complete_001', '9876543210', 'th', 'Complete claim', JSON.stringify([]), 'INTAKE']
      );
      
      const completeClaimId = completeClaimResult.rows[0].claim_id;
      
      const response = await request(app)
        .post(`/api/v1/claims/${completeClaimId}/questions/generate`)
        .expect(400);
      
      expect(response.body.title).toBe('No Missing Fields');
      
      // Clean up
      await db.pool.query('DELETE FROM claims WHERE claim_id = $1', [completeClaimId]);
    });
  });
  
  describe('POST /api/v1/claims/:claimId/questions/answers', () => {
    beforeEach(async () => {
      // Insert test questions
      await db.pool.query(
        `INSERT INTO clarifying_questions 
         (claim_id, question_th, question_en, generation_rationale, created_at)
         VALUES 
         ($1, $2, $3, $4, NOW()),
         ($1, $5, $6, $7, NOW()),
         ($1, $8, $9, $10, NOW())`,
        [
          testClaimId,
          'ทะเบียนรถของคุณคืออะไรครับ/ค่ะ?',
          'What is your license plate?',
          'Critical field',
          'เกิดเหตุที่ไหนครับ/ค่ะ?',
          'Where did it happen?',
          'Location needed',
          'มีเลขที่รายงานตำรวจไหมครับ/ค่ะ?',
          'Police report number?',
          'Police report filed'
        ]
      );
    });
    
    afterEach(async () => {
      await db.pool.query('DELETE FROM clarifying_questions WHERE claim_id = $1', [testClaimId]);
    });
    
    it('TC-015: should accept and store customer answers', async () => {
      const response = await request(app)
        .post(`/api/v1/claims/${testClaimId}/questions/answers`)
        .send({
          answers: [
            {
              questionTh: 'ทะเบียนรถของคุณคืออะไรครับ/ค่ะ?',
              answer: 'กก 1234 กรุงเทพ'
            },
            {
              questionTh: 'เกิดเหตุที่ไหนครับ/ค่ะ?',
              answer: 'แยกสุขุมวิท 21'
            },
            {
              questionTh: 'มีเลขที่รายงานตำรวจไหมครับ/ค่ะ?',
              answer: 'รง.123/2567'
            }
          ]
        })
        .expect(200);
      
      expect(response.body.answersSubmitted).toBe(3);
      expect(response.body.allQuestionsAnswered).toBe(true);
      expect(response.body.readyForReExtraction).toBe(true);
      
      // Verify answers stored
      const dbResult = await db.pool.query(
        'SELECT COUNT(*) as count FROM clarifying_questions WHERE claim_id = $1 AND answer IS NOT NULL',
        [testClaimId]
      );
      expect(parseInt(dbResult.rows[0].count)).toBe(3);
    });
    
    it('should handle partial answers', async () => {
      const response = await request(app)
        .post(`/api/v1/claims/${testClaimId}/questions/answers`)
        .send({
          answers: [
            {
              questionTh: 'ทะเบียนรถของคุณคืออะไรครับ/ค่ะ?',
              answer: 'กก 1234 กรุงเทพ'
            }
          ]
        })
        .expect(200);
      
      expect(response.body.answersSubmitted).toBe(1);
      expect(response.body.allQuestionsAnswered).toBe(false);
      expect(response.body.readyForReExtraction).toBe(false);
    });
    
    it('should return 400 for invalid answers format', async () => {
      const response = await request(app)
        .post(`/api/v1/claims/${testClaimId}/questions/answers`)
        .send({
          answers: 'invalid'
        })
        .expect(400);
      
      expect(response.body.title).toBe('Invalid Answers');
    });
  });
  
  describe('GET /api/v1/claims/:claimId/questions', () => {
    it('should retrieve all questions for a claim', async () => {
      // Insert test questions
      await db.pool.query(
        `INSERT INTO clarifying_questions 
         (claim_id, question_th, question_en, generation_rationale, created_at)
         VALUES ($1, $2, $3, $4, NOW())`,
        [testClaimId, 'ทะเบียนรถคืออะไร?', 'License plate?', 'Test question']
      );
      
      const response = await request(app)
        .get(`/api/v1/claims/${testClaimId}/questions`)
        .expect(200);
      
      expect(response.body.claimId).toBe(testClaimId);
      expect(response.body.questions.length).toBeGreaterThan(0);
      expect(response.body.questions[0]).toHaveProperty('question_th');
      expect(response.body.questions[0]).toHaveProperty('question_en');
      
      // Clean up
      await db.pool.query('DELETE FROM clarifying_questions WHERE claim_id = $1', [testClaimId]);
    });
  });
});