create or replace function public.delete_my_account()
returns boolean
language plpgsql
security definer
set search_path = public, auth, storage
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'auth_required';
  end if;

  delete from auth.users
  where id = v_uid;

  return true;
end;
$$;

grant execute on function public.delete_my_account() to authenticated;
