-- Safe migration: the lite checker should report 0 findings here.
CREATE INDEX CONCURRENTLY idx_users_email ON users (email);

ALTER TABLE users ADD COLUMN avatar_url text;

UPDATE accounts SET verified = true WHERE id = 42;

DELETE FROM sessions WHERE expired_at < now();
