-- Run once in the Supabase SQL editor (safe to re-run).
-- Bot sign-ups are held back automatically. Bots fill the sign-up form with scrambled names ("Hmrr Spbnxjtm") and
-- someone else's email address. Every new sign-up the daily sync brings in is checked; a likely bot is kept out of
-- Customers, reminders, counts and reports, its address is never emailed, and it is listed on the Customers page with a
-- Not a bot button. Anyone who has started or filed a return is never held back.
-- New tables get their own grants (Supabase no longer grants new tables automatically): the app's server only.

-- 1. How often each pair of letters appears in real names (learned from 295,000 words in FMCSA carrier names).
create table if not exists name_bigrams (bg text primary key, n int not null);
insert into name_bigrams (bg, n) values
('^a',13913), ('^b',13264), ('^c',28756), ('^d',13091), ('^e',10844), ('^f',8792), ('^g',9433), ('^h',9613), ('^i',36815), ('^j',11302), ('^k',5349), ('^l',23968),
('^m',16159), ('^n',3588), ('^o',4494), ('^p',11212), ('^q',539), ('^r',14478), ('^s',24987), ('^t',20831), ('^u',1180), ('^v',2624), ('^w',8886), ('^x',103),
('^y',583), ('^z',528), ('a$',6472), ('aa',466), ('ab',1516), ('ac',5030), ('ad',3457), ('ae',1470), ('af',703), ('ag',2470), ('ah',709), ('ai',3419),
('aj',162), ('ak',1246), ('al',14201), ('am',6530), ('an',28070), ('ao',38), ('ap',2639), ('aq',78), ('ar',20096), ('as',6770), ('at',10925), ('au',4003),
('av',5029), ('aw',1469), ('ax',236), ('ay',2990), ('az',458), ('b$',827), ('ba',3060), ('bb',540), ('bc',224), ('bd',38), ('be',6128), ('bf',10),
('bg',29), ('bh',33), ('bi',2211), ('bj',44), ('bk',36), ('bl',1538), ('bm',43), ('bn',51), ('bo',2236), ('bp',14), ('bq',4), ('br',4261),
('bs',389), ('bt',48), ('bu',2750), ('bv',11), ('bw',16), ('bx',1), ('by',507), ('bz',8), ('c$',47672), ('ca',9080), ('cb',48), ('cc',575),
('cd',131), ('ce',9076), ('cf',43), ('cg',110), ('ch',9638), ('ci',2256), ('cj',42), ('ck',11273), ('cl',1936), ('cm',135), ('cn',90), ('co',20557),
('cp',33), ('cq',58), ('cr',2786), ('cs',663), ('ct',7341), ('cu',1152), ('cv',97), ('cw',29), ('cx',1), ('cy',520), ('cz',102), ('d$',16568),
('da',5808), ('db',193), ('dc',145), ('dd',717), ('de',7652), ('df',108), ('dg',604), ('dh',108), ('di',4206), ('dj',70), ('dk',73), ('dl',585),
('dm',246), ('dn',279), ('do',4039), ('dp',30), ('dq',19), ('dr',1901), ('ds',2597), ('dt',364), ('du',2097), ('dv',233), ('dw',1126), ('dx',2),
('dy',1171), ('dz',31), ('e$',29241), ('ea',4693), ('eb',782), ('ec',4028), ('ed',4599), ('ee',4336), ('ef',1113), ('eg',1274), ('eh',553), ('ei',1921),
('ej',132), ('ek',616), ('el',11659), ('em',2706), ('en',16662), ('eo',1073), ('ep',2197), ('eq',660), ('er',36346), ('es',16773), ('et',5549), ('eu',549),
('ev',2536), ('ew',1760), ('ex',3267), ('ey',3845), ('ez',1564), ('f$',2538), ('fa',3176), ('fb',14), ('fc',43), ('fd',9), ('fe',1847), ('ff',1734),
('fg',75), ('fh',10), ('fi',1929), ('fj',9), ('fk',19), ('fl',1020), ('fm',128), ('fn',35), ('fo',1946), ('fp',8), ('fr',2149), ('fs',117),
('ft',330), ('fu',724), ('fv',2), ('fw',6), ('fx',6), ('fy',29), ('fz',1), ('g$',20074), ('ga',3212), ('gb',57), ('gc',25), ('gd',55),
('ge',5815), ('gf',54), ('gg',785), ('gh',1493), ('gi',2129), ('gj',15), ('gk',7), ('gl',1358), ('gm',122), ('gn',638), ('go',1742), ('gp',26),
('gq',8), ('gr',3491), ('gs',625), ('gt',251), ('gu',1230), ('gv',20), ('gw',41), ('gx',3), ('gy',186), ('h$',5441), ('ha',9133), ('hb',82),
('hc',73), ('hd',31), ('he',6835), ('hf',45), ('hg',19), ('hh',40), ('hi',3090), ('hj',20), ('hk',55), ('hl',635), ('hm',395), ('hn',2607),
('ho',5628), ('hp',15), ('hq',2), ('hr',1066), ('hs',198), ('ht',896), ('hu',1474), ('hv',28), ('hw',381), ('hx',1), ('hy',594), ('hz',1),
('i$',2100), ('ia',4684), ('ib',836), ('ic',13708), ('id',3463), ('ie',5461), ('if',681), ('ig',2789), ('ih',48), ('ii',497), ('ij',34), ('ik',650),
('il',8502), ('im',2561), ('in',64232), ('io',9654), ('ip',1679), ('iq',143), ('ir',3081), ('is',8142), ('it',5368), ('iu',144), ('iv',1808), ('iw',28),
('ix',385), ('iy',31), ('iz',391), ('j$',262), ('ja',3181), ('jb',67), ('jc',69), ('jd',54), ('je',1795), ('jf',21), ('jg',14), ('jh',22),
('ji',456), ('jj',39), ('jk',30), ('jl',48), ('jm',87), ('jn',30), ('jo',4357), ('jp',42), ('jq',1), ('jr',1153), ('js',64), ('jt',29),
('ju',575), ('jv',17), ('jw',29), ('jy',1), ('jz',3), ('k$',5916), ('ka',1135), ('kb',50), ('kc',54), ('kd',33), ('ke',5329), ('kf',30),
('kg',27), ('kh',286), ('ki',8182), ('kj',27), ('kk',56), ('kl',634), ('km',138), ('kn',279), ('ko',809), ('kp',18), ('kq',4), ('kr',474),
('ks',1254), ('kt',89), ('ku',319), ('kv',13), ('kw',95), ('kx',2), ('ky',465), ('kz',3), ('l$',14161), ('la',9925), ('lb',690), ('lc',11951),
('ld',4133), ('le',14459), ('lf',499), ('lg',154), ('lh',105), ('li',9006), ('lj',35), ('lk',480), ('ll',22435), ('lm',703), ('ln',104), ('lo',5095),
('lp',611), ('lq',12), ('lr',134), ('ls',2366), ('lt',2297), ('lu',2525), ('lv',723), ('lw',188), ('lx',2), ('ly',2033), ('lz',105), ('m$',4376),
('ma',9818), ('mb',1706), ('mc',1114), ('md',66), ('me',8357), ('mf',112), ('mg',74), ('mh',38), ('mi',5865), ('mj',52), ('mk',62), ('ml',135),
('mm',1113), ('mn',111), ('mo',4698), ('mp',3592), ('mq',17), ('mr',125), ('ms',2739), ('mt',122), ('mu',975), ('mv',19), ('mw',41), ('mx',9),
('my',508), ('mz',9), ('n$',33904), ('na',4900), ('nb',396), ('nc',37340), ('nd',11377), ('ne',9871), ('nf',176), ('ng',20440), ('nh',259), ('ni',4769),
('nj',139), ('nk',1220), ('nl',427), ('nm',302), ('nn',3680), ('no',2797), ('np',54), ('nq',24), ('nr',753), ('ns',12523), ('nt',10734), ('nu',863),
('nv',468), ('nw',180), ('nx',6), ('ny',3136), ('nz',439), ('o$',9642), ('oa',1037), ('ob',2831), ('oc',1695), ('od',3449), ('oe',1176), ('of',2430),
('og',1716), ('oh',2496), ('oi',867), ('oj',70), ('ok',558), ('ol',5515), ('om',6283), ('on',31023), ('oo',3822), ('op',2118), ('oq',23), ('or',17458),
('os',3663), ('ot',3106), ('ou',4629), ('ov',1724), ('ow',3497), ('ox',273), ('oy',1174), ('oz',224), ('p$',3537), ('pa',6519), ('pb',77), ('pc',53),
('pd',21), ('pe',4783), ('pf',87), ('pg',27), ('ph',2129), ('pi',2323), ('pj',22), ('pk',77), ('pl',2626), ('pm',915), ('pn',36), ('po',5754),
('pp',1653), ('pq',2), ('pr',5261), ('ps',608), ('pt',670), ('pu',502), ('pv',6), ('pw',13), ('px',5), ('py',66), ('pz',5), ('q$',26),
('qa',2), ('qb',4), ('qc',1), ('qh',1), ('qi',5), ('qm',2), ('qn',1), ('qo',1), ('qr',3), ('qs',2), ('qt',2), ('qu',1730),
('qw',2), ('r$',17684), ('ra',16141), ('rb',725), ('rc',1341), ('rd',4281), ('re',15777), ('rf',441), ('rg',2034), ('rh',218), ('ri',14744), ('rj',88),
('rk',2415), ('rl',2242), ('rm',3186), ('rn',2941), ('ro',13068), ('rp',4597), ('rq',47), ('rr',4057), ('rs',6417), ('rt',9354), ('ru',12251), ('rv',5477),
('rw',228), ('rx',25), ('ry',5558), ('rz',132), ('s$',35587), ('sa',3631), ('sb',264), ('sc',4273), ('sd',81), ('se',12105), ('sf',227), ('sg',40),
('sh',2979), ('si',3346), ('sj',28), ('sk',940), ('sl',716), ('sm',902), ('sn',331), ('so',8451), ('sp',4337), ('sq',75), ('sr',370), ('ss',3683),
('st',16383), ('su',2208), ('sv',154), ('sw',404), ('sx',3), ('sy',637), ('sz',46), ('t$',14468), ('ta',5968), ('tb',71), ('tc',674), ('td',642),
('te',14697), ('tf',73), ('tg',87), ('th',7188), ('ti',16103), ('tj',46), ('tk',161), ('tl',884), ('tm',386), ('tn',292), ('to',9273), ('tp',48),
('tq',3), ('tr',20975), ('ts',2233), ('tt',3357), ('tu',1550), ('tv',46), ('tw',302), ('tx',8), ('ty',1831), ('tz',747), ('u$',361), ('ua',1065),
('ub',691), ('uc',11950), ('ud',699), ('ue',1934), ('uf',425), ('ug',1178), ('uh',141), ('ui',2283), ('uj',45), ('uk',145), ('ul',2879), ('um',2260),
('un',3588), ('uo',40), ('up',1787), ('uq',24), ('ur',4297), ('us',3797), ('ut',3613), ('uu',8), ('uv',57), ('uw',36), ('ux',78), ('uy',125),
('uz',159), ('v$',306), ('va',4077), ('vb',5), ('vc',61), ('vd',10), ('ve',5958), ('vf',4), ('vg',7), ('vh',5), ('vi',9907), ('vj',9),
('vk',8), ('vl',40), ('vm',12), ('vn',12), ('vo',433), ('vp',10), ('vr',82), ('vs',43), ('vt',15), ('vu',27), ('vv',1), ('vw',6),
('vx',2), ('vy',96), ('w$',1500), ('wa',4425), ('wb',47), ('wc',48), ('wd',71), ('we',3290), ('wf',40), ('wg',17), ('wh',607), ('wi',4252),
('wj',12), ('wk',113), ('wl',151), ('wm',112), ('wn',1386), ('wo',1747), ('wp',27), ('wr',446), ('ws',424), ('wt',65), ('wu',44), ('wv',12),
('ww',17), ('wx',2), ('wy',119), ('x$',903), ('xa',135), ('xb',10), ('xc',1789), ('xd',2), ('xe',71), ('xf',16), ('xg',1), ('xh',21),
('xi',117), ('xk',1), ('xl',34), ('xm',2), ('xn',2), ('xo',72), ('xp',984), ('xq',3), ('xr',3), ('xs',19), ('xt',182), ('xu',12),
('xv',3), ('xw',22), ('xx',12), ('xy',18), ('y$',19229), ('ya',749), ('yb',72), ('yc',393), ('yd',448), ('ye',770), ('yf',30), ('yg',38),
('yh',30), ('yi',51), ('yj',4), ('yk',86), ('yl',720), ('ym',354), ('yn',1090), ('yo',459), ('yp',38), ('yq',1), ('yr',218), ('ys',1096),
('yt',179), ('yu',59), ('yv',26), ('yw',150), ('yx',2), ('yy',4), ('yz',14), ('z$',2537), ('za',719), ('zb',19), ('zc',31), ('zd',14),
('ze',598), ('zf',10), ('zg',20), ('zh',15), ('zi',351), ('zk',45), ('zl',43), ('zm',71), ('zn',19), ('zo',216), ('zp',8), ('zq',35),
('zr',5), ('zs',9), ('zt',13), ('zu',85), ('zv',2), ('zw',22), ('zy',83), ('zz',102)
on conflict (bg) do update set n = excluded.n;
create table if not exists name_letters (ch text primary key, n int not null);
insert into name_letters (ch, n) select left(bg, 1), sum(n) from name_bigrams group by 1
on conflict (ch) do update set n = excluded.n;

-- 2. Likely-bot sign-ups, held back from ttp_users. released = someone pressed Not a bot (never held again).
create table if not exists bot_signups (
  user_id int primary key,
  email text not null,
  name text, phone text, user_type text, registered_at timestamptz,
  reason text not null,
  held_at timestamptz not null default now(),
  released boolean not null default false,
  released_at timestamptz
);
create index if not exists bot_signups_held_idx on bot_signups(held_at desc);

-- Suppressions get a reason of their own for bots, so Not a bot can lift exactly that.
do $$ declare c text; begin
  for c in select conname from pg_constraint where conrelid = 'suppressions'::regclass and contype = 'c' and pg_get_constraintdef(oid) ilike '%reason%' loop
    execute format('alter table suppressions drop constraint %I', c);
  end loop;
end $$;
alter table suppressions add constraint suppressions_reason_check check (reason in ('unsubscribed','bounced','complained','manual','bot'));

-- 3. How normal a name's letter pairs are: the average log-probability per pair. Real names score above -3.5
--    (99.9% of 28,000 owner-operator names); the bots seen so far score between -3.6 and -5.8.
create or replace function bot_name_score(p_name text) returns numeric language plpgsql stable as $$
declare w text; s text; i int; tot float8 := 0; k int := 0; c float8; u float8;
begin
  for w in select m[1] from regexp_matches(coalesce(p_name, ''), '[A-Za-z]+', 'g') m loop
    s := '^' || lower(w) || '$';
    for i in 1 .. length(s) - 1 loop
      select coalesce((select b.n from name_bigrams b where b.bg = substr(s, i, 2)), 0) into c;
      select coalesce((select l.n from name_letters l where l.ch = substr(s, i, 1)), 0) into u;
      tot := tot + ln((c + 0.5) / (u + 0.5 * 28)); k := k + 1;
    end loop;
  end loop;
  if k = 0 then return null; end if;
  return round((tot / k)::numeric, 2);
end $$;

-- 4. The rule. All of these must be true: two words of 4+ letters each, no 3 letters of the name appear in the
--    email address, and a scrambled score (below -3.5). Returns the reason in plain words, or null.
create or replace function bot_reason(p_name text, p_email text) returns text language plpgsql stable as $$
declare ws text[]; w text; local text; i int; sc numeric;
begin
  select array_agg(m[1]) into ws from regexp_matches(coalesce(p_name, ''), '[A-Za-z]+', 'g') m;
  if coalesce(array_length(ws, 1), 0) <> 2 or length(ws[1]) < 4 or length(ws[2]) < 4 then return null; end if;
  local := regexp_replace(lower(split_part(coalesce(p_email, ''), '@', 1)), '[^a-z]', '', 'g');
  foreach w in array ws loop
    for i in 1 .. length(w) - 2 loop
      if position(lower(substr(w, i, 3)) in local) > 0 then return null; end if;
    end loop;
  end loop;
  sc := bot_name_score(p_name);
  if sc is null or sc >= -3.5 then return null; end if;
  return format('Scrambled name (score %s; real names score above -3.5), unrelated to the email address', sc);
end $$;

-- 5. Every sign-up the sync adds goes through this check first. A likely bot is held in bot_signups instead.
create or replace function ttp_users_bot_guard() returns trigger language plpgsql as $$
declare why text;
begin
  if exists (select 1 from bot_signups b where b.user_id = new.user_id and b.released) then return new; end if;
  if exists (select 1 from ttp_users t where t.user_id = new.user_id) then return new; end if;   -- only brand-new sign-ups are checked
  if exists (select 1 from ttp_filings f where f.user_id = new.user_id or lower(f.email) = lower(new.email)) then return new; end if;
  why := bot_reason(new.name, new.email);
  if why is null then return new; end if;
  insert into bot_signups (user_id, email, name, phone, user_type, registered_at, reason)
  values (new.user_id, lower(new.email), new.name, new.phone, new.user_type, new.registered_at, why)
  on conflict (user_id) do update set email = excluded.email, name = excluded.name, phone = excluded.phone, reason = excluded.reason;
  insert into suppressions (email, reason) values (lower(new.email), 'bot') on conflict (email) do nothing;
  return null;   -- not added to ttp_users
end $$;
drop trigger if exists ttp_users_bot_guard on ttp_users;
create trigger ttp_users_bot_guard before insert on ttp_users for each row execute function ttp_users_bot_guard();

-- 6. Not a bot: puts the sign-up back into Customers and lifts the bot suppression. It is never held again.
create or replace function release_bot_signup(p_user_id int) returns text language plpgsql as $$
declare b bot_signups;
begin
  select * into b from bot_signups where user_id = p_user_id;
  if not found then return 'not found'; end if;
  update bot_signups set released = true, released_at = now() where user_id = p_user_id;
  insert into ttp_users (user_id, email, name, phone, user_type, registered_at)
  values (b.user_id, b.email, b.name, b.phone, b.user_type, b.registered_at) on conflict (user_id) do nothing;
  delete from suppressions where email = b.email and reason = 'bot';
  return 'released';
end $$;

-- 7. Sign-ups already in Customers that match the rule (and have no return) are held back now too.
create or replace function hold_existing_bots() returns int language plpgsql as $$
declare u record; why text; k int := 0;
begin
  for u in select * from ttp_users t
           where not exists (select 1 from bot_signups b where b.user_id = t.user_id and b.released)
             and not exists (select 1 from ttp_filings f where f.user_id = t.user_id or lower(f.email) = lower(t.email)) loop
    why := bot_reason(u.name, u.email);
    if why is null then continue; end if;
    insert into bot_signups (user_id, email, name, phone, user_type, registered_at, reason)
    values (u.user_id, lower(u.email), u.name, u.phone, u.user_type, u.registered_at, why) on conflict (user_id) do nothing;
    insert into suppressions (email, reason) values (lower(u.email), 'bot') on conflict (email) do nothing;
    delete from ttp_users where user_id = u.user_id;
    k := k + 1;
  end loop;
  return k;
end $$;

revoke all on table name_bigrams, name_letters, bot_signups from public, anon, authenticated;
grant select on table name_bigrams, name_letters to service_role;
grant select, insert, update, delete on table bot_signups to service_role;
revoke all on function bot_name_score(text), bot_reason(text, text), release_bot_signup(int), hold_existing_bots() from public, anon, authenticated;
grant execute on function bot_name_score(text), bot_reason(text, text), release_bot_signup(int), hold_existing_bots() to service_role;

-- Check: real names should say null, bots should give a reason. Then hold back any already in Customers.
select bot_reason('Chandran Chan', 'chan2006@gmail.com') as real_name, bot_reason('Hmrr Spbnxjtm', 'ecvoss@cox.net') as bot;
select hold_existing_bots() as held_back_now;
