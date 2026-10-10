-- İşletme içi yetkinin tek modeli.
--
-- Sahip ve yönetici rolleri işletme genelinde yetkilidir. Personel yalnız kendisine verilen
-- izinleri, verildiği kapsamda (işletmenin tamamı, bir bölge ya da tek şube) kullanır.
-- İzin adları sözleşmelerdeki katalogdan gelir; yeni modül yeni tablo açmaz, yeni izin adı ekler.

-- Yeni işletme tablolarını aynı biçimde korur: RLS açık ve zorlanmış, işletme kapsamı, kurye
-- üyeliği bu tablolara hiçbir yoldan erişemez. Yalnız şema dosyalarında kullanılır.
create function vado_secure_tenant_table(target regclass) returns void
language plpgsql as $$
begin
  execute format('alter table %s enable row level security', target);
  execute format('alter table %s force row level security', target);
  execute format(
    'create policy tenant_scope on %s
       using (business_id = nullif(current_setting(''vado.business_id'', true), '''')::uuid)
       with check (business_id = nullif(current_setting(''vado.business_id'', true), '''')::uuid)',
    target);
  execute format(
    'create policy courier_denied on %s as restrictive
       using (current_user = ''vado_owner'' or not courier_actor(business_id))
       with check (current_user = ''vado_owner'' or not courier_actor(business_id))',
    target);
end $$;
revoke all on function vado_secure_tenant_table(regclass) from public;

-- Bölge şubeleri gruplar; kendi başına hiçbir yetki vermez.
create table business_regions (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 80),
  version integer not null default 1 check (version > 0),
  created_at timestamptz not null default now(),
  unique (business_id, id),
  unique (business_id, name)
);

-- Bir şube en çok bir bölgededir.
create table business_region_branches (
  business_id uuid not null,
  branch_id uuid not null,
  region_id uuid not null,
  primary key (business_id, branch_id),
  foreign key (business_id, branch_id) references branches (business_id, id) on delete cascade,
  foreign key (business_id, region_id) references business_regions (business_id, id) on delete cascade
);
create index business_region_branches_region on business_region_branches (business_id, region_id);

-- Personel izni: kapsam ya işletmenin tamamı (iki sütun da boş), ya bir bölge, ya bir şubedir.
-- Bölge izni, şubenin o anki bölgesine göre çözülür; şube taşınınca erişim kendiliğinden değişir.
create table business_member_grants (
  business_id uuid not null,
  member_id uuid not null,
  permission text not null check (permission ~ '^[a-z]+(\.[a-z_]+)+$'),
  region_id uuid,
  branch_id uuid,
  granted_by uuid not null references users (id),
  granted_at timestamptz not null default now(),
  foreign key (business_id, member_id) references business_members (business_id, id) on delete cascade,
  foreign key (business_id, region_id) references business_regions (business_id, id) on delete cascade,
  foreign key (business_id, branch_id) references branches (business_id, id) on delete cascade,
  constraint business_member_grant_single_scope check (region_id is null or branch_id is null),
  constraint business_member_grant_unique
    unique nulls not distinct (business_id, member_id, permission, region_id, branch_id)
);
create index business_member_grants_member on business_member_grants (business_id, member_id);

-- İzin yalnız etkin personele verilir; sahip ve yönetici zaten işletme genelinde yetkilidir.
create function check_member_grant() returns trigger language plpgsql as $$
begin
  if not exists (
    select 1 from business_members
    where business_id = new.business_id and id = new.member_id and role = 'staff' and active
  ) then
    raise exception 'İzin yalnız etkin personele verilir' using errcode = '23514';
  end if;
  return new;
end $$;
create trigger member_grant_check before insert on business_member_grants
  for each row execute function check_member_grant();
-- İzin değiştirilmez; silinip yeniden verilir. Böylece kimin, ne zaman verdiği kaybolmaz.
revoke update on business_member_grants from vado_app, vado_platform;

-- Personel pasifleşir ya da rolü değişirse izinleri silinir; yeniden etkinleşmek eski izni
-- geri getirmez.
create function clear_member_grants() returns trigger language plpgsql as $$
begin
  if not new.active or new.role <> 'staff' then
    delete from business_member_grants where business_id = new.business_id and member_id = new.id;
  end if;
  return new;
end $$;
create trigger member_grants_follow_membership after update of role, active on business_members
  for each row execute function clear_member_grants();

-- Telefon numarasına bağlı, süreli, tek kullanımlık personel daveti. Belirtecin kendisi
-- saklanmaz; yalnız SHA-256 özeti tutulur.
create table business_staff_invitations (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses (id) on delete cascade,
  recipient_phone text not null check (recipient_phone ~ '^\+[1-9][0-9]{7,14}$'),
  invited_by uuid not null references users (id),
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  accepted_at timestamptz,
  accepted_by uuid references users (id),
  revoked_at timestamptz,
  unique (business_id, id),
  check (expires_at > created_at),
  check (accepted_at is null or revoked_at is null),
  check ((accepted_at is null) = (accepted_by is null))
);
create index business_staff_invitations_recent on business_staff_invitations (business_id, created_at desc);

-- Davet kabul edilince verilecek izinler; biçimi personel izniyle aynıdır.
create table business_staff_invitation_grants (
  business_id uuid not null,
  invitation_id uuid not null,
  permission text not null check (permission ~ '^[a-z]+(\.[a-z_]+)+$'),
  region_id uuid,
  branch_id uuid,
  foreign key (business_id, invitation_id)
    references business_staff_invitations (business_id, id) on delete cascade,
  foreign key (business_id, region_id) references business_regions (business_id, id) on delete cascade,
  foreign key (business_id, branch_id) references branches (business_id, id) on delete cascade,
  check (region_id is null or branch_id is null),
  unique nulls not distinct (business_id, invitation_id, permission, region_id, branch_id)
);

-- Bu kullanıcının bu işletmede, bu şube için izni var mı? Şube boşsa yalnız işletme geneli izin
-- sayılır. Bütün modüller, liste süzgeçleri ve canlı olay alıcıları bu tek kuralı kullanır.
create function business_member_can(
  for_business uuid, for_user uuid, for_permission text, for_branch uuid
) returns boolean language sql stable as $$
  select exists (
    select 1
    from business_members m
    join users u on u.id = m.user_id and u.status = 'active'
    where m.business_id = for_business
      and m.user_id = for_user
      and m.active
      and (
        m.role in ('owner', 'manager')
        or m.role = 'staff' and exists (
          select 1
          from business_member_grants g
          where g.business_id = m.business_id
            and g.member_id = m.id
            and g.permission = for_permission
            and (
              (g.region_id is null and g.branch_id is null)
              or g.branch_id = for_branch
              or exists (
                select 1 from business_region_branches rb
                where rb.business_id = g.business_id
                  and rb.region_id = g.region_id
                  and rb.branch_id = for_branch
              )
            )
        )
      )
  )
$$;

-- Aynı kural, oturumdaki kişi ve işlemin işletme kapsamı için.
create function tenant_member_can(for_business uuid, for_permission text, for_branch uuid)
returns boolean language sql stable as $$
  select for_business = nullif(current_setting('vado.business_id', true), '')::uuid
    and business_member_can(
      for_business,
      nullif(current_setting('vado.user_id', true), '')::uuid,
      for_permission,
      for_branch
    )
$$;

-- Sahip ya da yönetici mi? Fiyat, iade kararı, ayarlar gibi devredilmeyen işler içindir.
create function tenant_member_manages(for_business uuid) returns boolean language sql stable as $$
  select for_business = nullif(current_setting('vado.business_id', true), '')::uuid
    and exists (
      select 1
      from business_members m
      join users u on u.id = m.user_id and u.status = 'active'
      where m.business_id = for_business
        and m.user_id = nullif(current_setting('vado.user_id', true), '')::uuid
        and m.active
        and m.role in ('owner', 'manager')
    )
$$;

-- 2.7'de personel bütün şubelerin siparişlerini görüp işleyebiliyor ve masa servisini
-- yürütebiliyordu. Yükseltmede hiçbir işletme iş kaybetmesin diye bu yetkiler işletme
-- genelinde izin olarak taşınır; sahip sonra daraltabilir.
insert into business_member_grants (business_id, member_id, permission, granted_by)
select m.business_id, m.id, p.permission, b.owner_id
from business_members m
join businesses b on b.id = m.business_id
cross join (values ('orders.view'), ('orders.manage'), ('tables.serve')) as p (permission)
where m.role = 'staff' and m.active;

select vado_secure_tenant_table('business_regions');
select vado_secure_tenant_table('business_region_branches');
select vado_secure_tenant_table('business_member_grants');
select vado_secure_tenant_table('business_staff_invitations');
select vado_secure_tenant_table('business_staff_invitation_grants');
