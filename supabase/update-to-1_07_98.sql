-- ============================================================
-- TechLog · update to v1.07.98
-- Пропозал по образцу заказчика:
--   work_types.code / extra_works.code — сокращение позиции (Item),
--     заполняет админ в справочнике: clean, TMM, DEH, AIR, RF, RWDSC…
--   proposals.sales_tax / freight — суммы в итогах бланка
--   note_templates — готовые блоки «Note:» для пропозалов
-- Идемпотентно: повторный запуск безопасен.
-- ============================================================
alter table public.work_types  add column if not exists code text not null default '';
alter table public.extra_works add column if not exists code text not null default '';

alter table public.proposals
  add column if not exists sales_tax numeric(12,2) not null default 0,
  add column if not exists freight   numeric(12,2) not null default 0;

create table if not exists public.note_templates (
  id         text primary key,
  title      text not null default '',
  body       text not null default '',
  sort       int  not null default 0,
  created_at timestamptz not null default now()
);
alter table public.note_templates enable row level security;
drop policy if exists nt_sel on public.note_templates;
create policy nt_sel on public.note_templates for select to authenticated using (true);
drop policy if exists nt_all on public.note_templates;
create policy nt_all on public.note_templates for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- готовые блоки с бланков заказчика
insert into public.note_templates (id, title, body, sort) values
 ('nt_out5','Residents out for 5 hours',
  '- Residents have to be out of the apartment for 5 hours', 1),
 ('nt_cross','Cross-contamination',
  '- To prevent cross-contamination, all affected closing must be removed from the apartment before remediation begins and professionally cleaned before being brought back into the unit.', 2),
 ('nt_stains','Stains may remain',
  '- Please be advised that there are instances where stains caused by organic growth may not be completely removable from affected surfaces. In cases where stains remain after the remediation process, it is typically recommended to prime and paint the affected areas.', 3),
 ('nt_visible','Pricing on visible damage',
  '- Pricing is based on visible damage. Any concealed damage or additional demolition required beyond the initial scope will be quoted separately or billed as a change order.', 4)
on conflict (id) do nothing;

insert into public.org_settings (id) values ('org') on conflict (id) do nothing;
