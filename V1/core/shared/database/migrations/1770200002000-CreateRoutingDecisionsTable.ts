import { MigrationInterface, QueryRunner, Table, TableIndex } from 'typeorm';

export class CreateRoutingDecisionsTable1770200002000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'routing_decisions',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            default: 'uuid_generate_v4()',
          },
          {
            name: 'attendance_id',
            type: 'uuid',
            isNullable: false,
          },
          {
            name: 'message_id',
            type: 'uuid',
            isNullable: true,
          },
          {
            name: 'router_id',
            type: 'uuid',
            isNullable: false,
          },
          {
            name: 'output_id',
            type: 'uuid',
            isNullable: true,
          },
          {
            name: 'destination_type',
            type: 'varchar',
            length: '20',
            isNullable: false,
          },
          {
            name: 'destination_id',
            type: 'uuid',
            isNullable: true,
          },
          {
            name: 'response_id',
            type: 'varchar',
            length: '200',
            isNullable: true,
          },
          {
            name: 'intent_id',
            type: 'varchar',
            length: '100',
            isNullable: true,
          },
          {
            name: 'channel',
            type: 'varchar',
            length: '50',
            isNullable: true,
          },
          {
            name: 'confidence',
            type: 'float',
            isNullable: true,
          },
          {
            name: 'created_at',
            type: 'timestamp',
            default: 'CURRENT_TIMESTAMP',
            isNullable: false,
          },
        ],
      }),
      true
    );

    await queryRunner.createIndex(
      'routing_decisions',
      new TableIndex({
        name: 'idx_routing_decisions_attendance_created',
        columnNames: ['attendance_id', 'created_at'],
      })
    );

    await queryRunner.createIndex(
      'routing_decisions',
      new TableIndex({
        name: 'idx_routing_decisions_router_id',
        columnNames: ['router_id'],
      })
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('routing_decisions');
  }
}
