-- Intentionally risky migration (the lite checker should flag all 4)
DROP TABLE temp_accounts;

ALTER TABLE users DROP COLUMN middle_name;

DELETE FROM sessions;

UPDATE accounts SET verified = true;
