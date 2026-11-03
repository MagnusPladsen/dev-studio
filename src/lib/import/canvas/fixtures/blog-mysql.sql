/* A tiny blog, MySQL flavour, written by hand for the importer tests. */
CREATE TABLE `users` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `handle` varchar(40) CHARACTER SET utf8mb4 NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `users_handle` (`handle`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE `posts` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `author_id` int unsigned NOT NULL,
  `title` varchar(200) NOT NULL,
  # MySQL also has hash comments
  PRIMARY KEY (`id`),
  KEY `posts_author` (`author_id`),
  CONSTRAINT `posts_author_fk` FOREIGN KEY (`author_id`) REFERENCES `users` (`id`)
) ENGINE=InnoDB;
