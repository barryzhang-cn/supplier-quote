import {
  pgTable,
  pgEnum,
  uuid,
  text,
  timestamp,
  numeric,
  boolean,
  uniqueIndex,
  index,
  type AnyPgColumn,
} from 'drizzle-orm/pg-core';

export const userRole = pgEnum('user_role', ['admin', 'procurement', 'supplier']);
export const tenderStatus = pgEnum('tender_status', ['open', 'closed']);

export const users = pgTable('users', {
  id: uuid('id').defaultRandom().primaryKey(),
  username: text('username').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  role: userRole('role').notNull().default('supplier'),
  companyName: text('company_name'),
  active: boolean('active').notNull().default(true),
  createdBy: uuid('created_by').references((): AnyPgColumn => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const tenders = pgTable('tenders', {
  id: uuid('id').defaultRandom().primaryKey(),
  title: text('title').notNull(),
  description: text('description'),
  deadline: timestamp('deadline', { withTimezone: true }).notNull(),
  status: tenderStatus('status').notNull().default('open'),
  createdBy: uuid('created_by')
    .notNull()
    .references(() => users.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const quotes = pgTable(
  'quotes',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    tenderId: uuid('tender_id')
      .notNull()
      .references(() => tenders.id),
    supplierId: uuid('supplier_id')
      .notNull()
      .references(() => users.id),
    amount: numeric('amount', { precision: 14, scale: 2 }).notNull(),
    note: text('note'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('quotes_tender_supplier_uq').on(t.tenderId, t.supplierId)],
);

export const tenderInvitations = pgTable(
  'tender_invitations',
  {
    tenderId: uuid('tender_id')
      .notNull()
      .references(() => tenders.id, { onDelete: 'cascade' }),
    supplierId: uuid('supplier_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    invitedAt: timestamp('invited_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('tender_invitations_tender_supplier_uq').on(t.tenderId, t.supplierId),
    index('tender_invitations_supplier_idx').on(t.supplierId, t.tenderId),
  ],
);
