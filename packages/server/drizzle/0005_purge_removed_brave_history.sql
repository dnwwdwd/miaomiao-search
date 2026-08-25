UPDATE search_history
SET engines = (
  SELECT COALESCE(json_group_array(value), '[]')
  FROM json_each(search_history.engines)
  WHERE value <> 'brave'
)
WHERE json_valid(engines)
  AND EXISTS (SELECT 1 FROM json_each(search_history.engines) WHERE value = 'brave');

UPDATE request_log
SET engines = (
  SELECT COALESCE(json_group_array(value), '[]')
  FROM json_each(request_log.engines)
  WHERE value <> 'brave'
)
WHERE engines IS NOT NULL
  AND json_valid(engines)
  AND EXISTS (SELECT 1 FROM json_each(request_log.engines) WHERE value = 'brave');
