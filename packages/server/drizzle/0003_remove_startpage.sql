DELETE FROM engine WHERE id = 'startpage';

UPDATE setting
SET value = CASE
  WHEN json_valid(value) THEN COALESCE((SELECT json_group_array(value) FROM json_each(setting.value) WHERE value <> 'startpage'), '[]')
  ELSE '[]'
END,
updated_at = CURRENT_TIMESTAMP
WHERE key = 'search.homeEngines';
