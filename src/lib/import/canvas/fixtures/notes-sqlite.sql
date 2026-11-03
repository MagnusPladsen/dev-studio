-- SQLite flavour, written by hand for the importer tests.
PRAGMA foreign_keys = ON;
CREATE TABLE notebooks (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL);
CREATE TABLE notes (
  id INTEGER PRIMARY KEY,
  notebook_id INTEGER REFERENCES notebooks(id),
  body TEXT
) WITHOUT ROWID;
INSERT INTO notebooks (title) VALUES ('Inbox');
