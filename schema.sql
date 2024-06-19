drop table if exists alerts;
create table if not exists alerts (
    id integer primary key not null, 
    priority integer, 
    alertType text, 
    lastUpdated text, 
    routeOrder integer, 
    route text,
    routeBranch text,
    routeTypeSrc text,
    routeType text,
    stopStart text,
    stopEnd text,
    title text,
    description text,
    url text,
    urlPlaceholder text,
    accessibility text,
    effect text,
    effectDesc text,
    severityOrder integer,
    severity text,
    customHeaderText text,
    headerText text
)