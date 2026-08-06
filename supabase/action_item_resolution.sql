-- Same reasoning as customer_issues.resolution (see comments_and_resolution.sql):
-- a completed checkbox on its own doesn't say what actually happened. Extends
-- the "resolution requires a reason" rule from Customer Issues to Action Items.
alter table action_items add column if not exists resolution text;
