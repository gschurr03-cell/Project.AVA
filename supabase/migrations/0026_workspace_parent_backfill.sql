-- Backfill the immutable version chain in environments where 0024 was applied
-- before parent linkage was included in its legacy-row migration.
with version_parents as (
  select id, lag(id) over (partition by session_id order by version_number) as parent_analysis_id
  from public.analyses
)
update public.analyses a set parent_analysis_id = version_parents.parent_analysis_id
from version_parents
where version_parents.id = a.id
  and a.parent_analysis_id is null
  and version_parents.parent_analysis_id is not null;
