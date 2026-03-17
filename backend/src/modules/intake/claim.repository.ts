const { Pool } = require('pg');
const config = require('../../config/database.config');

class ClaimRepository {
  constructor() {
    this.pool = new Pool(config.postgres);
  }

  /**
   * Create new claim record in PostgreSQL
   */
  async createClaim(claimData) {
    const client = await this.pool.connect();
    
    try {
      await client.query('BEGIN');

      const insertQuery = `
        INSERT INTO claims (
          claim_id,
          policy_number,
          status,
          language,
          created_at,
          updated_at,
          incident_date,
          incident_location_lat,
          incident_location_lng,
          incident_address,
          narrative,
          injuries_reported,
          police_report_filed,
          police_report_number
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
        RETURNING *
      `;

      const values = [
        claimData.claimId,
        claimData.policyNumber,
        claimData.status,
        claimData.language,
        claimData.createdAt,
        claimData.updatedAt,
        claimData.incidentDate,
        claimData.incidentLocation?.lat,
        claimData.incidentLocation?.lng,
        claimData.incidentLocation?.address,
        claimData.narrative,
        claimData.injuriesReported,
        claimData.policeReportFiled,
        claimData.policeReportNumber
      ];

      const result = await client.query(insertQuery, values);
      
      await client.query('COMMIT');
      
      return result.rows[0];
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Get claim by ID
   */
  async getClaimById(claimId) {
    const query = 'SELECT * FROM claims WHERE claim_id = $1';
    const result = await this.pool.query(query, [claimId]);
    return result.rows[0];
  }

  /**
   * Update claim status
   */
  async updateClaimStatus(claimId, status) {
    const query = `
      UPDATE claims 
      SET status = $1, updated_at = $2 
      WHERE claim_id = $3
      RETURNING *
    `;
    const result = await this.pool.query(query, [
      status,
      new Date().toISOString(),
      claimId
    ]);
    return result.rows[0];
  }
}

module.exports = new ClaimRepository();