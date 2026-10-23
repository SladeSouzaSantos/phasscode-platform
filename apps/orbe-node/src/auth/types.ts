export interface AuthUser {
  id: string;
  email: string | null;
  displayName: string;
  roles: string[];
  disabled: boolean;
}
export interface ExternalProfile {
  issuer: string;
  subject: string;
  email: string | null;
  displayName: string;
}
export interface OAuthTransaction {
  stateHash: string;
  browserHash: string;
  nonce: string;
  verifier: string;
  expiresAt: Date;
}
export interface NewAuthSession {
  id: string;
  userId: string;
  familyId: string;
  tokenHash: string;
  csrfToken: string;
  expiresAt: Date;
  absoluteExpiresAt: Date;
}
export interface AuthSession extends NewAuthSession {
  user: AuthUser;
  revokedAt: Date | null;
}
export interface AuthStore {
  saveTransaction(transaction: OAuthTransaction): Promise<void>;
  consumeTransaction(stateHash: string, browserHash: string): Promise<OAuthTransaction | undefined>;
  findOrCreateUser(profile: ExternalProfile): Promise<AuthUser>;
  insertSession(session: NewAuthSession): Promise<void>;
  sessionByHash(hash: string): Promise<AuthSession | undefined>;
  sessionById(id: string): Promise<AuthSession | undefined>;
  rotateSession(oldId: string, session: NewAuthSession): Promise<'rotated' | 'reused' | 'expired'>;
  revokeFamily(familyId: string): Promise<void>;
}
export interface Principal {
  userId: string;
  roles: string[];
  sessionId: string;
}
