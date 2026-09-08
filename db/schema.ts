import { integer, sqliteTable, text, primaryKey, index } from 'drizzle-orm/sqlite-core';

export const partyRooms = sqliteTable('party_rooms', {
  code: text('code').primaryKey(),
  hostTokenHash: text('host_token_hash').notNull(),
  createdAt: integer('created_at').notNull(),
  expiresAt: integer('expires_at').notNull(),
  closedAt: integer('closed_at'),
  updatedAt: integer('updated_at').notNull(),
  stateJson: text('state_json'),
}, (table) => [index('party_rooms_expiry_idx').on(table.expiresAt)]);

export const partyPlayers = sqliteTable('party_players', {
  roomCode: text('room_code').notNull().references(() => partyRooms.code, { onDelete: 'cascade' }),
  playerId: integer('player_id').notNull(),
  tokenHash: text('token_hash').notNull(),
  blueprintJson: text('blueprint_json').notNull(),
  ready: integer('ready').notNull().default(0),
  readyHeat: integer('ready_heat').notNull().default(1),
  packetSeq: integer('packet_seq').notNull().default(-1),
  eventsJson: text('events_json').notNull().default('[]'),
  offerJson: text('offer_json'),
  answerJson: text('answer_json'),
  hostSeenOfferJson: text('host_seen_offer_json'),
  lastSeenAt: integer('last_seen_at').notNull(),
}, (table) => [primaryKey({ columns: [table.roomCode, table.playerId] })]);
