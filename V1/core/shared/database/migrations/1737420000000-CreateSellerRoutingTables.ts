import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateSellerRoutingTables1737420000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Create seller_routing_state table
    await queryRunner.query(`
      CREATE TABLE seller_routing_state (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        vehicle_brand VARCHAR(50) NOT NULL,
        last_assigned_seller_id UUID REFERENCES users(id),
        assignment_counter INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW(),
        UNIQUE(vehicle_brand)
      );
    `);

    // Create client_seller_history table
    await queryRunner.query(`
      CREATE TABLE client_seller_history (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        client_phone VARCHAR(20) NOT NULL,
        vehicle_brand VARCHAR(50) NOT NULL,
        seller_id UUID REFERENCES users(id),
        supervisor_id UUID REFERENCES users(id),
        first_routed_at TIMESTAMP DEFAULT NOW(),
        last_routed_at TIMESTAMP DEFAULT NOW(),
        total_attendances INTEGER DEFAULT 1,
        UNIQUE(client_phone, vehicle_brand)
      );
    `);

    // Create index for performance
    await queryRunner.query(`
      CREATE INDEX idx_client_seller_phone_brand 
      ON client_seller_history(client_phone, vehicle_brand);
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop index
    await queryRunner.query(`DROP INDEX IF EXISTS idx_client_seller_phone_brand;`);
    
    // Drop tables
    await queryRunner.query(`DROP TABLE IF EXISTS client_seller_history;`);
    await queryRunner.query(`DROP TABLE IF EXISTS seller_routing_state;`);
  }
}
