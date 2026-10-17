-- The retro's rules, held by the database so that no two requests at once
-- can break them. Each trigger's raised text is the constraintName the
-- actions show beside the form that broke it.

-- A member's votes on one retro stop at its budget.
CREATE TRIGGER `votes_budget` BEFORE INSERT ON `votes`
WHEN (SELECT count(*) FROM `votes` WHERE `retro_id` = NEW.`retro_id` AND `user_id` = NEW.`user_id`)
  >= (SELECT `votes_per_person` FROM `retros` WHERE `id` = NEW.`retro_id`)
BEGIN
  SELECT RAISE(ABORT, 'votes_budget');
END;
--> statement-breakpoint
-- Votes are cast only while the retro is voting.
CREATE TRIGGER `votes_open` BEFORE INSERT ON `votes`
WHEN (SELECT `phase` FROM `retros` WHERE `id` = NEW.`retro_id`) <> 'voting'
BEGIN
  SELECT RAISE(ABORT, 'votes_closed');
END;
--> statement-breakpoint
-- Notes go up while the retro collects them; action items while it's
-- collecting or being discussed, which is when they're agreed.
CREATE TRIGGER `notes_open` BEFORE INSERT ON `notes`
WHEN NOT (
  (SELECT `phase` FROM `retros` WHERE `id` = NEW.`retro_id`) = 'collecting'
  OR (NEW.`board_column` = 'action' AND (SELECT `phase` FROM `retros` WHERE `id` = NEW.`retro_id`) = 'discussing')
)
BEGIN
  SELECT RAISE(ABORT, 'notes_closed');
END;
--> statement-breakpoint
-- A team has one owner: nobody else becomes one, and the owner's role
-- doesn't change.
CREATE TRIGGER `memberships_one_owner` BEFORE INSERT ON `memberships`
WHEN NEW.`role` = 'owner' AND EXISTS (SELECT 1 FROM `memberships` WHERE `team_id` = NEW.`team_id` AND `role` = 'owner')
BEGIN
  SELECT RAISE(ABORT, 'memberships_one_owner');
END;
--> statement-breakpoint
CREATE TRIGGER `memberships_owner_stays` BEFORE UPDATE OF `role` ON `memberships`
WHEN OLD.`role` = 'owner' OR NEW.`role` = 'owner'
BEGIN
  SELECT RAISE(ABORT, 'memberships_one_owner');
END;
