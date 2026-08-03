-- Staff sign-in handle and last-login stamp on `users`.
--
-- Additive and nullable: every existing row is a customer, who identifies by phone and has no
-- username. The unique index therefore cannot collide — SQLite treats each NULL as distinct, so
-- any number of customers can carry a null username.
ALTER TABLE "users" ADD COLUMN "username" TEXT;
ALTER TABLE "users" ADD COLUMN "last_login_at" DATETIME;

CREATE UNIQUE INDEX "users_username_key" ON "users"("username");
