-- TSIDEK: legal cooperation backend foundation
-- Core posture:
-- 1. Supabase/Postgres is the primary source of truth.
-- 2. OneDrive is an external document adapter, not the core database.
-- 3. Every matter is firm-scoped and protected with RLS.

create extension if not exists "uuid-ossp";

-- 1. firms and users
create table if not exists firms (
    id uuid primary key default uuid_generate_v4(),
    name text not null,
    country text default 'Cameroon',
    created_at timestamptz not null default now()
);

create table if not exists lawyers (
    id uuid primary key references auth.users(id) on delete cascade,
    firm_id uuid not null references firms(id) on delete cascade,
    full_name text not null,
    role text check (role in ('Partner', 'Senior Associate', 'Junior Associate', 'Intern', 'Paralegal', 'Project Manager')),
    microsoft_graph_token text,
    created_at timestamptz not null default now()
);

-- 2. roles and permissions
create table if not exists firm_roles (
    id uuid primary key default uuid_generate_v4(),
    firm_id uuid not null references firms(id) on delete cascade,
    name text not null,
    description text,
    is_system boolean not null default false,
    created_at timestamptz not null default now(),
    unique (firm_id, name)
);

create table if not exists role_permissions (
    id uuid primary key default uuid_generate_v4(),
    role_id uuid not null references firm_roles(id) on delete cascade,
    permission_key text not null,
    created_at timestamptz not null default now(),
    unique (role_id, permission_key)
);

-- 3. matter core
create table if not exists matters (
    id uuid primary key default uuid_generate_v4(),
    firm_id uuid not null references firms(id) on delete cascade,
    lead_lawyer_id uuid references lawyers(id),
    title text not null,
    client_name text not null,
    status text check (status in ('Lead', 'Onboarding', 'Active', 'In Court', 'Closed')),
    risk_level text check (risk_level in ('Low', 'Medium', 'High')),
    matter_type text,
    jurisdiction text default 'OHADA',
    synopsis text,
    primary_track text,
    risk_to_monitor text,
    ai_usage_rule text,
    next_draft text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create table if not exists matter_members (
    id uuid primary key default uuid_generate_v4(),
    matter_id uuid not null references matters(id) on delete cascade,
    lawyer_id uuid not null references lawyers(id) on delete cascade,
    firm_role_id uuid references firm_roles(id),
    is_primary boolean not null default false,
    created_at timestamptz not null default now(),
    unique (matter_id, lawyer_id)
);

-- 4. tasks, comments, and audit
create table if not exists tasks (
    id uuid primary key default uuid_generate_v4(),
    matter_id uuid not null references matters(id) on delete cascade,
    assigned_to uuid references lawyers(id),
    title text not null,
    description text,
    deadline timestamptz,
    status text not null default 'Open' check (status in ('Open', 'In Progress', 'Blocked', 'Done')),
    is_completed boolean not null default false,
    created_at timestamptz not null default now()
);

create table if not exists matter_comments (
    id uuid primary key default uuid_generate_v4(),
    matter_id uuid not null references matters(id) on delete cascade,
    author_id uuid references lawyers(id),
    body text not null,
    comment_type text not null default 'note' check (comment_type in ('note', 'ai', 'approval', 'warning')),
    created_at timestamptz not null default now()
);

create table if not exists audit_logs (
    id uuid primary key default uuid_generate_v4(),
    firm_id uuid not null references firms(id) on delete cascade,
    matter_id uuid references matters(id) on delete cascade,
    actor_id uuid references lawyers(id),
    action_type text not null,
    description text not null,
    is_critical boolean not null default false,
    created_at timestamptz not null default now()
);

-- 5. documents and physical file registry
create table if not exists documents (
    id uuid primary key default uuid_generate_v4(),
    matter_id uuid not null references matters(id) on delete cascade,
    uploaded_by uuid references lawyers(id),
    title text not null,
    document_type text,
    onedrive_file_id text,
    storage_path text,
    ai_summary text,
    requires_compliance_audit boolean not null default false,
    created_at timestamptz not null default now()
);

create table if not exists physical_files (
    id uuid primary key default uuid_generate_v4(),
    matter_id uuid not null unique references matters(id) on delete cascade,
    file_code text not null unique,
    label text not null,
    location text,
    custody_status text,
    qr_payload text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create table if not exists file_custody_events (
    id uuid primary key default uuid_generate_v4(),
    physical_file_id uuid not null references physical_files(id) on delete cascade,
    actor_id uuid references lawyers(id),
    event_type text not null check (event_type in ('registered', 'checked_out', 'checked_in', 'relocated')),
    note text,
    created_at timestamptz not null default now()
);

-- 6. billing
create table if not exists invoices (
    id uuid primary key default uuid_generate_v4(),
    matter_id uuid not null references matters(id) on delete cascade,
    amount_xaf decimal not null,
    status text check (status in ('Draft', 'Sent', 'Partial', 'Paid', 'Overdue')),
    due_date timestamptz,
    created_at timestamptz not null default now()
);

-- 7. updated_at trigger
create or replace function set_updated_at()
returns trigger
language plpgsql
as $$
begin
    new.updated_at = now();
    return new;
end;
$$;

drop trigger if exists set_matters_updated_at on matters;
create trigger set_matters_updated_at
before update on matters
for each row
execute function set_updated_at();

drop trigger if exists set_physical_files_updated_at on physical_files;
create trigger set_physical_files_updated_at
before update on physical_files
for each row
execute function set_updated_at();

-- 8. row level security
alter table firms enable row level security;
alter table lawyers enable row level security;
alter table matters enable row level security;
alter table matter_members enable row level security;
alter table tasks enable row level security;
alter table matter_comments enable row level security;
alter table documents enable row level security;
alter table physical_files enable row level security;
alter table file_custody_events enable row level security;
alter table invoices enable row level security;
alter table audit_logs enable row level security;
alter table firm_roles enable row level security;
alter table role_permissions enable row level security;

create or replace function current_firm_id()
returns uuid
language sql
stable
as $$
    select firm_id from lawyers where id = auth.uid()
$$;

create policy "firm members can read their firm record" on firms
for select using (id = current_firm_id());

create policy "firm members can read lawyers in their firm" on lawyers
for select using (firm_id = current_firm_id());

create policy "firm members can manage their own matters" on matters
for all using (firm_id = current_firm_id())
with check (firm_id = current_firm_id());

create policy "firm members can read matter membership" on matter_members
for all using (
    exists (
        select 1 from matters
        where matters.id = matter_members.matter_id
          and matters.firm_id = current_firm_id()
    )
)
with check (
    exists (
        select 1 from matters
        where matters.id = matter_members.matter_id
          and matters.firm_id = current_firm_id()
    )
);

create policy "firm members can access tasks" on tasks
for all using (
    exists (
        select 1 from matters
        where matters.id = tasks.matter_id
          and matters.firm_id = current_firm_id()
    )
)
with check (
    exists (
        select 1 from matters
        where matters.id = tasks.matter_id
          and matters.firm_id = current_firm_id()
    )
);

create policy "firm members can access comments" on matter_comments
for all using (
    exists (
        select 1 from matters
        where matters.id = matter_comments.matter_id
          and matters.firm_id = current_firm_id()
    )
)
with check (
    exists (
        select 1 from matters
        where matters.id = matter_comments.matter_id
          and matters.firm_id = current_firm_id()
    )
);

create policy "firm members can access documents" on documents
for all using (
    exists (
        select 1 from matters
        where matters.id = documents.matter_id
          and matters.firm_id = current_firm_id()
    )
)
with check (
    exists (
        select 1 from matters
        where matters.id = documents.matter_id
          and matters.firm_id = current_firm_id()
    )
);

create policy "firm members can access physical files" on physical_files
for all using (
    exists (
        select 1 from matters
        where matters.id = physical_files.matter_id
          and matters.firm_id = current_firm_id()
    )
)
with check (
    exists (
        select 1 from matters
        where matters.id = physical_files.matter_id
          and matters.firm_id = current_firm_id()
    )
);

create policy "firm members can access file custody events" on file_custody_events
for all using (
    exists (
        select 1
        from physical_files
        join matters on matters.id = physical_files.matter_id
        where physical_files.id = file_custody_events.physical_file_id
          and matters.firm_id = current_firm_id()
    )
)
with check (
    exists (
        select 1
        from physical_files
        join matters on matters.id = physical_files.matter_id
        where physical_files.id = file_custody_events.physical_file_id
          and matters.firm_id = current_firm_id()
    )
);

create policy "firm members can access invoices" on invoices
for all using (
    exists (
        select 1 from matters
        where matters.id = invoices.matter_id
          and matters.firm_id = current_firm_id()
    )
)
with check (
    exists (
        select 1 from matters
        where matters.id = invoices.matter_id
          and matters.firm_id = current_firm_id()
    )
);

create policy "firm members can access audit logs" on audit_logs
for all using (firm_id = current_firm_id())
with check (firm_id = current_firm_id());

create policy "firm members can access firm roles" on firm_roles
for all using (firm_id = current_firm_id())
with check (firm_id = current_firm_id());

create policy "firm members can access role permissions" on role_permissions
for all using (
    exists (
        select 1 from firm_roles
        where firm_roles.id = role_permissions.role_id
          and firm_roles.firm_id = current_firm_id()
    )
)
with check (
    exists (
        select 1 from firm_roles
        where firm_roles.id = role_permissions.role_id
          and firm_roles.firm_id = current_firm_id()
    )
);
