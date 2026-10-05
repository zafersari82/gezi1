-- Paketi yükleyen ile onaylayanın ayrılması (dört göz ilkesi).
--
-- Bir sürümü yükleyen ya da incelemeye gönderen hesap o sürümü onaylayamaz. Kural serviste
-- uygulanır; bu tetikleyici, uygulamadaki bir hataya ya da elle yazılmış bir SQL'e karşı da korur.
-- package_versions_guard (0003) içeriğin değişmezliğini korumaya devam eder; bu dosya ona yalnızca
-- yeni bir kural ekler.

-- İncelemeye gönderen hesap. 2.4'ten önce gönderilmiş sürümlerde boştur: böyle bir sürüm
-- onaylanmadan önce bir hesap tarafından yeniden incelemeye gönderilir (yalnızca bu alan dolar,
-- durum değişmez).
alter table package_versions add column submitted_by text;

create function package_versions_review_guard() returns trigger
language plpgsql as $$
begin
  if new.submitted_by is distinct from old.submitted_by then
    -- Gönderen yalnızca bir kez, sürüm incelemeye girerken (ya da 2.4'ten önce gönderilmiş
    -- sürümde bir kez sonradan) yazılır; sonra değişmez.
    if old.submitted_by is not null
      or new.submitted_by is null
      or new.status <> 'in_review'
      or old.status not in ('draft', 'in_review')
    then
      raise exception 'Paket sürümünü incelemeye gönderen değiştirilemez: % %',
        old.package_id, old.version;
    end if;
  end if;

  if old.status = 'draft' and new.status = 'in_review' and new.submitted_by is null then
    raise exception 'Paket sürümü gönderen hesap yazılmadan incelemeye alınamaz: % %',
      old.package_id, old.version;
  end if;

  if old.status = 'in_review' and new.status = 'approved' then
    if new.submitted_by is null then
      raise exception 'İncelemeye göndereni bilinmeyen paket sürümü onaylanamaz: % %',
        old.package_id, old.version;
    end if;
    if new.reviewed_by is null or new.reviewed_by in (new.uploaded_by, new.submitted_by) then
      raise exception 'Paket sürümünü yükleyen ya da incelemeye gönderen hesap onaylayamaz: % %',
        old.package_id, old.version;
    end if;
  end if;

  return new;
end;
$$;

create trigger package_versions_review_guard
  before update on package_versions
  for each row execute function package_versions_review_guard();
