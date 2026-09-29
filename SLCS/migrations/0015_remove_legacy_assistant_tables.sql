-- V32 decommission: remove legacy assistant-era storage from already deployed databases.
DROP TABLE IF EXISTS ai_rate_limits;
DROP TABLE IF EXISTS ai_action_requests;
DROP TABLE IF EXISTS ai_audit;
DROP TABLE IF EXISTS ai_messages;
DROP TABLE IF EXISTS ai_conversations;
DELETE FROM organization_entitlements WHERE capability='ai.use';
