import { MigrationInterface, QueryRunner, Table, TableForeignKey, TableIndex } from 'typeorm';

export class CreateNotifications1737756000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Create notifications table
    await queryRunner.createTable(
      new Table({
        name: 'notifications',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            default: 'uuid_generate_v4()',
          },
          {
            name: 'user_id',
            type: 'uuid',
            isNullable: false,
          },
          {
            name: 'type',
            type: 'varchar',
            length: '50',
            isNullable: false,
          },
          {
            name: 'priority',
            type: 'varchar',
            length: '20',
            default: "'MEDIUM'",
            isNullable: false,
          },
          {
            name: 'title',
            type: 'varchar',
            length: '255',
            isNullable: false,
          },
          {
            name: 'message',
            type: 'text',
            isNullable: false,
          },
          {
            name: 'metadata',
            type: 'jsonb',
            isNullable: true,
          },
          {
            name: 'is_read',
            type: 'boolean',
            default: false,
            isNullable: false,
          },
          {
            name: 'read_at',
            type: 'timestamp',
            isNullable: true,
          },
          {
            name: 'attendance_id',
            type: 'uuid',
            isNullable: true,
          },
          {
            name: 'reference_id',
            type: 'varchar',
            length: '255',
            isNullable: true,
          },
          {
            name: 'action_url',
            type: 'varchar',
            length: '500',
            isNullable: true,
          },
          {
            name: 'created_at',
            type: 'timestamp',
            default: 'CURRENT_TIMESTAMP',
            isNullable: false,
          },
          {
            name: 'updated_at',
            type: 'timestamp',
            default: 'CURRENT_TIMESTAMP',
            isNullable: false,
          },
          {
            name: 'expires_at',
            type: 'timestamp',
            isNullable: true,
          },
        ],
      }),
      true
    );

    // Create foreign key to users table
    await queryRunner.createForeignKey(
      'notifications',
      new TableForeignKey({
        columnNames: ['user_id'],
        referencedColumnNames: ['id'],
        referencedTableName: 'users',
        onDelete: 'CASCADE',
      })
    );

    // Create foreign key to attendances table (optional)
    await queryRunner.createForeignKey(
      'notifications',
      new TableForeignKey({
        columnNames: ['attendance_id'],
        referencedColumnNames: ['id'],
        referencedTableName: 'attendances',
        onDelete: 'SET NULL',
      })
    );

    // Create indexes for better performance
    await queryRunner.createIndex(
      'notifications',
      new TableIndex({
        name: 'IDX_notifications_user_id',
        columnNames: ['user_id'],
      })
    );

    await queryRunner.createIndex(
      'notifications',
      new TableIndex({
        name: 'IDX_notifications_is_read',
        columnNames: ['is_read'],
      })
    );

    await queryRunner.createIndex(
      'notifications',
      new TableIndex({
        name: 'IDX_notifications_user_id_is_read',
        columnNames: ['user_id', 'is_read'],
      })
    );

    await queryRunner.createIndex(
      'notifications',
      new TableIndex({
        name: 'IDX_notifications_attendance_id',
        columnNames: ['attendance_id'],
      })
    );

    await queryRunner.createIndex(
      'notifications',
      new TableIndex({
        name: 'IDX_notifications_reference_id',
        columnNames: ['reference_id'],
      })
    );

    await queryRunner.createIndex(
      'notifications',
      new TableIndex({
        name: 'IDX_notifications_created_at',
        columnNames: ['created_at'],
      })
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop indexes
    await queryRunner.dropIndex('notifications', 'IDX_notifications_created_at');
    await queryRunner.dropIndex('notifications', 'IDX_notifications_reference_id');
    await queryRunner.dropIndex('notifications', 'IDX_notifications_attendance_id');
    await queryRunner.dropIndex('notifications', 'IDX_notifications_user_id_is_read');
    await queryRunner.dropIndex('notifications', 'IDX_notifications_is_read');
    await queryRunner.dropIndex('notifications', 'IDX_notifications_user_id');

    // Drop foreign keys
    const table = await queryRunner.getTable('notifications');
    if (table) {
      const attendanceForeignKey = table.foreignKeys.find(
        (fk) => fk.columnNames.indexOf('attendance_id') !== -1
      );
      if (attendanceForeignKey) {
        await queryRunner.dropForeignKey('notifications', attendanceForeignKey);
      }

      const userForeignKey = table.foreignKeys.find(
        (fk) => fk.columnNames.indexOf('user_id') !== -1
      );
      if (userForeignKey) {
        await queryRunner.dropForeignKey('notifications', userForeignKey);
      }
    }

    // Drop table
    await queryRunner.dropTable('notifications');
  }
}
