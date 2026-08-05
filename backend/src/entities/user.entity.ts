import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { encryptedTransformer } from '../crypto.util';

@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true, name: 'hca_sub' })
  hcaSub: string;

  @Column({ type: 'text', transformer: encryptedTransformer })
  email: string;

  @Column({ nullable: true })
  name: string;

  @Column({ nullable: true })
  nickname: string;

  @Column({ nullable: true, name: 'slack_id' })
  slackId: string;

  @Column({ nullable: true, name: 'reviewer_user_note', type: 'text' })
  reviewerUserNote: string | null;

  // Reviewer-facing sentiment markers. Purely notes: they do NOT change the
  // user's perms/access (a marked user behaves exactly like a normal User). Any
  // reviewer can toggle them from the review or audit panel. They are mutually
  // exclusive — a builder is either watch-listed (concerning) or a cool builder
  // (trusted), never both.
  @Column({ name: 'watchlisted', default: false })
  watchlisted: boolean;

  @Column({ name: 'cool_builder', default: false })
  coolBuilder: boolean;

  @Column({ name: 'two_emails', default: false })
  twoEmails: boolean;

  // Manual Super Admin override for identity.hackclub.com's live verification
  // result — set when the external check is wrong for a user (e.g. their
  // identity doc got linked to the wrong Slack account) while that gets fixed
  // upstream. null = defer to the live check; otherwise short-circuits it.
  // See IdentityService.getStatus().
  @Column({ nullable: true, name: 'identity_override', type: 'varchar', length: 20 })
  identityOverride: 'eligible' | 'ineligible' | null;

  @Column({ nullable: true, name: 'identity_override_reason', type: 'text' })
  identityOverrideReason: string | null;

  @Column({ name: 'has_address', default: false })
  hasAddress: boolean;

  // Country from the address on the user's Hack Club Auth profile, normalized
  // via normalizeCountry() and refreshed at every login. Drives regional shop
  // price overrides. Only this coarse value is persisted — the full address is
  // always fetched live from HCA (see AdminService.getOrderDetailForFulfillment).
  @Column({ type: 'varchar', length: 64, nullable: true })
  country: string | null;

  @Column({ name: 'has_birthdate', default: false })
  hasBirthdate: boolean;

  @Column({ nullable: true, name: 'hackatime_user_id' })
  hackatimeUserId: string;

  @Column({ nullable: true })
  gender: string;

  // Answer to the one-time "here for the hackathon or the shop?" home prompt.
  // null = not answered yet → the modal keeps showing until they pick one.
  @Column({ type: 'varchar', length: 20, nullable: true })
  intent: string | null;

  @Column({
    nullable: true,
    name: 'hackatime_token',
    type: 'text',
    transformer: encryptedTransformer,
  })
  hackatimeToken: string;

  @Column({
    nullable: true,
    name: 'hca_access_token',
    type: 'text',
    transformer: encryptedTransformer,
  })
  hcaAccessToken: string;

  @Column({
    nullable: true,
    name: 'hca_refresh_token',
    type: 'text',
    transformer: encryptedTransformer,
  })
  hcaRefreshToken: string;

  @Column({ type: 'integer', default: 0 })
  pipes: number;

  @Column({ nullable: true, name: 'utm_source' })
  utmSource: string;

  @Column({ nullable: true, name: 'utm_medium' })
  utmMedium: string;

  @Column({ nullable: true, name: 'utm_campaign' })
  utmCampaign: string;

  @Column({ nullable: true })
  referrer: string;

  @Column({ nullable: true, name: 'landing_path' })
  landingPath: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
