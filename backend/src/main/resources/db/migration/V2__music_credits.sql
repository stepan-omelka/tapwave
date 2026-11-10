-- Songs from audio files carry their attribution: where they are published and under which license.
alter table beatmap
    add column audio_source_url  varchar(255),
    add column audio_license     varchar(60),
    add column audio_license_url varchar(255);
