# Frontend

## Supabase setup

1. Configure `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in `frontend/.env`.
2. Run `frontend/supabase/schema.sql` in the Supabase SQL Editor. It creates the application tables, authenticated-user RLS policies, the `store-logos` Storage bucket, and the atomic `create_transaction` function.
3. Create the admin account under **Authentication → Users** in the Supabase dashboard. The frontend uses that account's email and password; public sign-up is not enabled by the app.
4. Start the frontend with `npm run dev` from `frontend`. Product, settings, transaction, auth, and logo operations go directly to Supabase.
