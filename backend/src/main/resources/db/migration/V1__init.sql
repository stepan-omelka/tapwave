create table beatmap (
    id                 bigserial primary key,
    slug               varchar(64)      not null unique,
    title              varchar(120)     not null,
    artist             varchar(120)     not null,
    mapper             varchar(60)      not null,
    difficulty_name    varchar(40)      not null,
    bpm                double precision not null check (bpm > 0),
    offset_ms          integer          not null default 0,
    circle_size        double precision not null check (circle_size between 0 and 10),
    approach_rate      double precision not null check (approach_rate between 0 and 10),
    overall_difficulty double precision not null check (overall_difficulty between 0 and 10),
    hp_drain           double precision not null check (hp_drain between 0 and 10),
    duration_ms        integer          not null,
    audio_url          varchar(255),
    synth_seed         bigint,
    star_rating        double precision not null,
    object_count       integer          not null,
    max_combo          integer          not null,
    hit_objects        jsonb            not null,
    created_at         timestamptz      not null default now()
);

create table player (
    id         bigserial primary key,
    name       varchar(24) not null,
    created_at timestamptz not null default now()
);

-- Player names are unique regardless of letter case.
create unique index player_name_lower_uq on player (lower(name));

-- One row per started play. A score can only be submitted once per play and
-- only after enough time passed for the map to actually be played.
create table play_session (
    id           uuid primary key,
    beatmap_id   bigint      not null references beatmap (id) on delete cascade,
    started_at   timestamptz not null,
    submitted_at timestamptz
);

create table score (
    id              bigserial primary key,
    beatmap_id      bigint       not null references beatmap (id) on delete cascade,
    player_id       bigint       not null references player (id) on delete cascade,
    play_session_id uuid         not null unique references play_session (id) on delete cascade,
    total_score     bigint       not null check (total_score >= 0),
    max_combo       integer      not null check (max_combo >= 0),
    accuracy        numeric(5, 2) not null check (accuracy between 0 and 100),
    count300        integer      not null,
    count100        integer      not null,
    count50         integer      not null,
    count_miss      integer      not null,
    grade           varchar(2)   not null,
    created_at      timestamptz  not null default now()
);

create index score_beatmap_best_idx on score (beatmap_id, player_id, total_score desc);
create index score_created_idx on score (created_at desc);
