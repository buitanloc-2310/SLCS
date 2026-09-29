-- V34: generalize Exam Center into reusable Assessment Engine.
ALTER TABLE exams ADD COLUMN assessment_type TEXT NOT NULL DEFAULT 'class_test';
ALTER TABLE exams ADD COLUMN assessment_label TEXT NOT NULL DEFAULT 'Kiểm tra lớp học';
ALTER TABLE exams ADD COLUMN center_label TEXT NOT NULL DEFAULT 'Trung tâm Đánh giá';
CREATE INDEX IF NOT EXISTS idx_exams_assessment_type ON exams(assessment_type,status);
