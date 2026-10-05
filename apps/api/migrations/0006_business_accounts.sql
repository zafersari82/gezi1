-- İşletme hesapları (2.5): panel hesabının kapsamı.
--
-- 2.4'te bütün panel hesapları bütün kayıtlar üzerinde çalışır. Bu dosyadan sonra bir hesap bir
-- işletmeye bağlanabilir ('business' rolü); böyle bir hesap yalnızca o işletmenin satıcı olarak
-- bağlı olduğu uygulama kayıtlarını görür. Kapsam serviste uygulanır; buradaki kısıtlar, kapsamsız
-- bir işletme hesabının ya da kapsamı sonradan değişen bir hesabın oluşmasını veritabanında da
-- engeller.

alter table admin_accounts
  drop constraint admin_accounts_role_check,
  add constraint admin_accounts_role_check
    check (role in ('owner', 'reviewer', 'operator', 'support', 'auditor', 'business'));

-- İşletme silinmez (kullanıcı uygulamasında işletmeler yalnızca kapatılır); bağlı hesap varken
-- silinmeye çalışılırsa veritabanı reddeder.
alter table admin_accounts
  add column business_id uuid references businesses (id) on delete restrict,
  add constraint admin_accounts_business_scope_check
    check ((role = 'business') = (business_id is not null));

create index admin_accounts_business_idx on admin_accounts (business_id)
  where business_id is not null;

-- Hesabın kapsamı açıldığı gibi kalır: işletme hesabı başka bir işletmeye taşınamaz, ekip
-- hesabına çevrilemez; ekip hesabı da işletme hesabına çevrilemez. Gerekirse hesap kapatılır ve
-- yenisi açılır; böylece denetim kaydındaki her işlem tek bir kapsamla yapılmış olur.
create function admin_accounts_scope_guard() returns trigger
language plpgsql as $$
begin
  if new.business_id is distinct from old.business_id then
    raise exception 'Panel hesabının işletmesi değiştirilemez: %', old.username;
  end if;
  return new;
end;
$$;

create trigger admin_accounts_scope_guard
  before update on admin_accounts
  for each row execute function admin_accounts_scope_guard();
