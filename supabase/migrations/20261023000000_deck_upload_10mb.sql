-- Pitch deck uploads: 20 MB → 10 MB (2026-10-21).
--
-- Staff preview PPTX decks through Microsoft's Office Online viewer, which
-- can't open PowerPoint files much over 10 MB. Capping uploads at 10 MB means
-- every deck can be previewed. The form and the admin "Replace pitch deck"
-- screen check the same limit; this bucket setting is what enforces it.
-- Decks already uploaded are unaffected.

update storage.buckets
set file_size_limit = 10485760 -- 10 MB
where id = 'registration-decks';
