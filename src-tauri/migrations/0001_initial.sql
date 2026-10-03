CREATE TABLE categories (
  id       TEXT CONSTRAINT pk_categories PRIMARY KEY,
  name     TEXT CONSTRAINT nn_categories_name NOT NULL CONSTRAINT ck_categories_name_nonempty CHECK (length(trim(name)) > 0),
  position INTEGER CONSTRAINT nn_categories_position NOT NULL,
  CONSTRAINT uq_categories_position UNIQUE (position)
);

CREATE TABLE tasks (
  id           TEXT CONSTRAINT pk_tasks PRIMARY KEY,
  category_id  TEXT CONSTRAINT nn_tasks_category_id NOT NULL,
  title        TEXT CONSTRAINT nn_tasks_title NOT NULL CONSTRAINT ck_tasks_title_nonempty CHECK (length(trim(title)) > 0),
  description  TEXT,
  position     INTEGER CONSTRAINT nn_tasks_position NOT NULL,
  status       TEXT CONSTRAINT nn_tasks_status NOT NULL CONSTRAINT ck_tasks_status CHECK (status IN ('active', 'completed')),
  completed_at TEXT,
  CONSTRAINT fk_tasks_category FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE RESTRICT,
  CONSTRAINT uq_tasks_category_position UNIQUE (category_id, position),
  CONSTRAINT ck_tasks_completion_state CHECK ((status = 'completed') = (completed_at IS NOT NULL))
);

CREATE TABLE settings (
  key   TEXT CONSTRAINT pk_settings PRIMARY KEY,
  value TEXT CONSTRAINT nn_settings_value NOT NULL
);
