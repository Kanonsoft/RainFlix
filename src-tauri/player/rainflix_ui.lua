local utils = require("mp.utils")
local cached_content, cached_ui

local function read_ui()
    local path = os.getenv("RAINFLIX_PLAYER_METADATA")
    if not path then return {} end
    local file = io.open(path, "rb")
    if not file then return {} end
    local content = file:read("*a")
    file:close()
    if content == cached_content then return cached_ui end
    local decoded = utils.parse_json(content)
    if not decoded then return cached_ui or {} end
    cached_content, cached_ui = content, decoded
    return decoded
end

local ui = read_ui()
local restoring_tracks = true
local preferences_timer
local skip_options = { intro=false,outro=false,preview=true,preload=true }
local preload_video
local preload_retry_at=0
local skipped_chapter
local skip_prompt = { last_input=mp.get_time() }
local function canonical_language(value)
    local code = tostring(value or "und"):lower():gsub("_","-")
    local aliases = { eng="en",jpn="ja",spa="es",fre="fr",fra="fr",ger="de",deu="de",chi="zh",zho="zh",
        kor="ko",por="pt",ita="it",rus="ru",ara="ar",hin="hi",ind="id",tha="th",vie="vi",fil="tl" }
    return aliases[code] or code
end
local function track_choice(kind,property)
    local selected = mp.get_property(property,"no")
    if selected == "no" then return { off=true } end
    for _,track in ipairs(mp.get_property_native("track-list") or {}) do
        if track.type == kind and tostring(track.id) == selected then
            return { lang=canonical_language(track.lang),title=track.title or "",codec=track.codec or "",
                forced=track.forced == true,sdh=track["hearing-impaired"] == true }
        end
    end
end
local function save_preferences(immediate)
    if restoring_tracks then return end
    if preferences_timer then preferences_timer:kill() end
    local emit = function()
        mp.commandv("script-message","rainflix-preferences",utils.format_json({
            audio=track_choice("audio","aid"),sub=track_choice("sub","sid"),
            delay=mp.get_property_number("sub-delay",0),scale=mp.get_property_number("sub-scale",1),
            position=mp.get_property_number("sub-pos",100),volume=mp.get_property_number("volume",100),
            speed=mp.get_property_number("speed",1),mute=mp.get_property_bool("mute",false) }))
    end
    if immediate==true then preferences_timer=nil; emit()
    else preferences_timer=mp.add_timeout(0.15,emit) end
end
local function restore_preferences()
    local saved = ui.tracks or {}
    skip_options.intro = saved.skipIntro == true
    skip_options.outro = saved.skipOutro == true
    skip_options.preview = saved.nextPreview ~= false
    skip_options.preload = saved.preloadNext ~= false
    for _,item in ipairs({ { kind="audio",property="aid",choice=saved.audio },{ kind="sub",property="sid",choice=saved.sub } }) do
        local choice = item.choice
        if choice then
            if choice.off then mp.set_property(item.property,"no")
            else
                local best,score = nil,-1
                for _,track in ipairs(mp.get_property_native("track-list") or {}) do
                    if track.type == item.kind and canonical_language(track.lang) == canonical_language(choice.lang) then
                        local value = (track.title == choice.title and 2 or 0)+(track.codec == choice.codec and 1 or 0)
                            +((track.forced == true) == choice.forced and 4 or 0)+((track["hearing-impaired"] == true) == choice.sdh and 4 or 0)
                        if value > score then best=track.id; score=value end
                    end
                end
                if best then mp.set_property_number(item.property,best) end
            end
        end
    end
    for property,name in pairs({ ["sub-delay"]="delay",["sub-scale"]="scale",["sub-pos"]="position",volume="volume",speed="speed" }) do
        if type(saved[name]) == "number" then mp.set_property_number(property,saved[name]) end
    end
    if type(saved.mute) == "boolean" then mp.set_property_bool("mute",saved.mute) end
    mp.add_timeout(0.2,function() restoring_tracks=false; save_preferences() end)
end
local overlay = mp.create_osd_overlay("ass-events")
local panel = nil
local language = nil
local language_page = 0
local variant_page = 0
local audio_page = 0
local episode_page = 0
local episode_focus_pending = false
local activity_x
local chapter_page = 0
local ready = false
local has_played = false
local buffer_fill = 0
local was_buffering = false
local smoke_buffer = nil
local season = tonumber(ui.season) or 1
local season_page = 0
local hitboxes = {}
local bitmap_cache = {}
local wanted_bitmaps = {}
local stream_video = nil
local stream_choices = nil
local stream_page = 0
local stream_provider = nil
local stream_item_count = 0
local stream_request = 0
local bitmap_uploads = 0
local last_render = mp.get_time()
local width, height = 1280, 720

local function bitmap(command)
    wanted_bitmaps[command.id] = true
    local key = utils.format_json(command)
    if bitmap_cache[command.id] ~= key then
        mp.command_native(command)
        bitmap_cache[command.id] = key
        bitmap_uploads = bitmap_uploads + 1
    end
end

local C = {
    background = "15110D",
    surface = "282522",
    row = "393430",
    purple = "F8BD38",
    white = "FFFFFF",
    muted = "B7B1AA",
    green = "83CC25",
}

local function clamp(value, minimum, maximum)
    return math.max(minimum, math.min(maximum, value))
end

local function ass_escape(value)
    return tostring(value or ""):gsub("\\", "\\\\"):gsub("{", "\\{"):gsub("}", "\\}"):gsub("\n", " ")
end

local function shorten(value, limit)
    value = tostring(value or "")
    if #value <= limit then return value end
    local last, index = 0, 1
    while index <= #value and index <= limit - 3 do
        local byte = value:byte(index)
        local size = byte < 128 and 1 or (byte < 224 and 2 or (byte < 240 and 3 or 4))
        if index + size - 1 > limit - 3 then break end
        last = index + size - 1
        index = index + size
    end
    return value:sub(1, last) .. "..."
end

local function rectangle(parts, x, y, w, h, color, alpha)
    if w <= 0 or h <= 0 then return end
    parts[#parts + 1] = string.format(
        "{\\an7\\pos(%.0f,%.0f)\\bord0\\shad0\\1c&H%s&\\alpha&H%02X&\\p1}m 0 0 l %.0f 0 l %.0f %.0f l 0 %.0f{\\p0}",
        x, y, color, alpha or 0, w, w, h, h
    )
end

local function label(parts, x, y, value, size, color, anchor, alpha)
    parts[#parts + 1] = string.format(
        "{\\an%d\\pos(%.0f,%.0f)\\bord0\\shad0\\fnSegoe UI\\fs%.0f\\1c&H%s&\\alpha&H%02X&}%s",
        anchor or 7, x, y, (size or 20)+4, color or C.white, alpha or 0, ass_escape(value)
    )
end

local function rounded(parts, x, y, w, h, color, alpha)
    local r = math.min(8, h / 2)
    parts[#parts + 1] = string.format(
        "{\\an7\\pos(%g,%g)\\bord0\\shad0\\1c&H%s&\\alpha&H%02X&\\p1}" ..
        "m %g 0 l %g 0 b %g 0 %g 0 %g %g l %g %g b %g %g %g %g %g %g " ..
        "l %g %g b 0 %g 0 %g 0 %g l 0 %g b 0 0 0 0 %g 0{\\p0}",
        x, y, color, alpha or 0, r, w-r, w, w, w, r, w, h-r,
        w, h, w, h, w-r, h, r, h, h, h, h-r, r, r)
end

local function hovered(x, y, w, h)
    local pos = mp.get_property_native("mouse-pos") or {}
    return pos.hover and pos.x >= x and pos.x <= x+w and pos.y >= y and pos.y <= y+h
end

local function hit(x, y, w, h, action)
    hitboxes[#hitboxes + 1] = { x = x, y = y, w = w, h = h, action = action }
end

local function button(parts, x, y, w, h, title, action, active)
    if active or hovered(x,y,w,h) then rounded(parts, x, y, w, h, active and C.purple or C.row, active and 0xB0 or 0x30) end
    label(parts, x + w / 2, y + h / 2, title, 17, C.white, 5)
    hit(x, y, w, h, action)
end

local function wrap_lines(value, limit)
    local lines={}
    for paragraph in (tostring(value or ""):gsub("\r","").."\n"):gmatch("(.-)\n") do
        local line,length="",0
        for character in paragraph:gmatch("[%z\1-\127\194-\244][\128-\191]*") do
            if length>=limit then
                local before,after=line:match("^(.*) (.-)$")
                if before and #before>0 then
                    lines[#lines+1]=before; line=after; length=0
                    for _ in line:gmatch("[%z\1-\127\194-\244][\128-\191]*") do length=length+1 end
                else lines[#lines+1]=line; line,length="",0 end
            end
            line=line..character; length=length+1
        end
        lines[#lines+1]=line
    end
    return lines
end

local function list_scrollbar(parts,x,top,bottom,total,offset,visible,set_offset)
    if total<=visible then return end
    local track=bottom-top
    local thumb=math.max(32,track*visible/total)
    rounded(parts,x,top,5,track,C.row,0x40)
    rounded(parts,x,top+(track-thumb)*offset/math.max(1,total-visible),5,thumb,C.muted,0x30)
    hit(x-8,top,21,track,function(_,y)
        set_offset(math.floor(clamp((y-top-thumb/2)/math.max(1,track-thumb),0,1)*(total-visible)))
    end)
end

local function circle(parts,x,y,r,color)
    local k = r*0.5522848
    parts[#parts+1] = string.format("{\\an7\\pos(%g,%g)\\bord0\\shad0\\1c&H%s&\\p1}m 0 %g b 0 %g %g 0 %g 0 b %g 0 %g %g %g %g b %g %g %g %g %g %g b %g %g 0 %g 0 %g{\\p0}",
        x-r,y-r,color,r,r-k,r-k,r,r+k,2*r,r-k,2*r,r,2*r,r+k,r+k,2*r,r,2*r,r-k,2*r,r+k,r)
end

local icon_paths = {
    play = "m 6 3 l 22 14 l 6 25",
    pause = "m 5 4 l 11 4 l 11 24 l 5 24 m 17 4 l 23 4 l 23 24 l 17 24",
    rewind = "m 13 4 l 2 14 l 13 24 m 26 4 l 15 14 l 26 24",
    forward = "m 2 4 l 13 14 l 2 24 m 15 4 l 26 14 l 15 24",
    back = "m 19 3 l 8 14 l 19 25 l 22 22 l 14 14 l 22 6",
    close = "m 5 3 l 14 12 l 23 3 l 25 5 l 16 14 l 25 23 l 23 25 l 14 16 l 5 25 l 3 23 l 12 14 l 3 5",
    volume = "m 2 10 l 8 10 l 16 3 l 16 25 l 8 18 l 2 18 m 20 8 l 23 8 l 23 20 l 20 20 m 25 4 l 27 4 l 27 24 l 25 24",
    mute = "m 2 10 l 8 10 l 16 3 l 16 25 l 8 18 l 2 18 m 20 8 l 26 18 l 24 20 l 18 10 m 24 8 l 26 10 l 20 20 l 18 18",
    fullscreen = "m 2 10 l 2 2 l 10 2 l 10 5 l 5 5 l 5 10 m 18 2 l 26 2 l 26 10 l 23 10 l 23 5 l 18 5 m 2 18 l 5 18 l 5 23 l 10 23 l 10 26 l 2 26 m 23 18 l 26 18 l 26 26 l 18 26 l 18 23 l 23 23",
    audio = "m 3 10 l 6 10 l 6 18 l 3 18 m 9 4 l 12 4 l 12 24 l 9 24 m 15 8 l 18 8 l 18 20 l 15 20 m 21 2 l 24 2 l 24 26 l 21 26",
    chapters = "m 3 3 l 7 3 l 7 25 l 3 25 m 11 4 l 26 4 l 26 7 l 11 7 m 11 12 l 26 12 l 26 15 l 11 15 m 11 20 l 26 20 l 26 23 l 11 23",
    episodes = "m 2 6 l 22 6 l 22 23 l 2 23 l 2 20 l 19 20 l 19 9 l 5 9 l 5 20 l 2 20 m 7 1 l 27 1 l 27 18 l 24 18 l 24 4 l 7 4",
    settings = "m 3 5 l 26 5 l 26 8 l 3 8 m 3 13 l 26 13 l 26 16 l 3 16 m 3 21 l 26 21 l 26 24 l 3 24 m 8 2 l 12 2 l 12 11 l 8 11 m 19 10 l 23 10 l 23 19 l 19 19 m 10 18 l 14 18 l 14 27 l 10 27",
}

local function icon_button(parts, x, y, w, h, name, tooltip, action, active)
    if active or hovered(x,y,w,h) then rounded(parts, x,y,w,h,active and C.purple or C.row,active and 0xB8 or 0x30) end
    if name == "subtitles" then
        label(parts,x+w/2,y+h/2,"CC",19,active and C.purple or C.white,5)
    elseif name == "speed" then
        label(parts,x+w/2,y+h/2,string.format("%gx",mp.get_property_number("speed",1)),18,C.white,5)
    else
        parts[#parts+1] = string.format("{\\an7\\pos(%g,%g)\\bord0\\shad0\\1c&H%s&\\p1}%s{\\p0}",
            x+(w-28)/2,y+(h-28)/2,active and C.purple or C.white,icon_paths[name] or icon_paths.chapters)
    end
    hit(x,y,w,h,action)
    if hovered(x,y,w,h) then
        local tw = #tooltip*8+24
        local tx = clamp(x+w/2-tw/2,12,width-tw-12)
        local ty = y < height/2 and y+h+8 or y-38
        rounded(parts,tx,ty,tw,30,C.background,0x08)
        label(parts,tx+tw/2,ty+15,tooltip,14,C.white,5)
    end
end

local function format_time(seconds)
    seconds = math.max(0, math.floor(tonumber(seconds) or 0))
    local hours = math.floor(seconds / 3600)
    local minutes = math.floor(seconds % 3600 / 60)
    if hours > 0 then return string.format("%d:%02d:%02d", hours, minutes, seconds % 60) end
    return string.format("%02d:%02d", minutes, seconds % 60)
end

local function tracks_of(kind)
    local results = {}
    for _, track in ipairs(mp.get_property_native("track-list") or {}) do
        if track.type == kind then results[#results + 1] = track end
    end
    return results
end

local language_names = {
    en = "English", eng = "English", ja = "Japanese", jpn = "Japanese",
    es = "Spanish", spa = "Spanish", fr = "French", fre = "French",
    de = "German", ger = "German", ar = "Arabic", ara = "Arabic",
    pt = "Portuguese", por = "Portuguese", ko = "Korean", kor = "Korean",
    zh = "Chinese", chi = "Chinese", it = "Italian", ita = "Italian",
    ru = "Russian", rus = "Russian", hi = "Hindi", hin = "Hindi",
    zho = "Chinese", cmn = "Mandarin Chinese", yue = "Cantonese",
    ["zh-hans"] = "Chinese (Simplified)", ["zh-hant"] = "Chinese (Traditional)",
    ["zh-cn"] = "Chinese (Simplified)", ["zh-tw"] = "Chinese (Traditional)",
    ["zh-hk"] = "Chinese (Traditional)", ["pt-br"] = "Portuguese (Brazil)",
    id = "Indonesian", ind = "Indonesian", th = "Thai", tha = "Thai",
    vi = "Vietnamese", vie = "Vietnamese", ms = "Malay", msa = "Malay", may = "Malay",
    tl = "Filipino", fil = "Filipino", cs = "Czech", ces = "Czech", cze = "Czech",
    da = "Danish", dan = "Danish", nl = "Dutch", nld = "Dutch", dut = "Dutch",
    fi = "Finnish", fin = "Finnish", sv = "Swedish", swe = "Swedish",
    no = "Norwegian", nor = "Norwegian", nb = "Norwegian", pl = "Polish", pol = "Polish",
    tr = "Turkish", tur = "Turkish", el = "Greek", ell = "Greek", gre = "Greek",
    he = "Hebrew", heb = "Hebrew", hu = "Hungarian", hun = "Hungarian",
    ro = "Romanian", ron = "Romanian", rum = "Romanian", uk = "Ukrainian", ukr = "Ukrainian",
    ta = "Tamil", tam = "Tamil", te = "Telugu", tel = "Telugu", bn = "Bengali", ben = "Bengali",
    fa = "Persian", fas = "Persian", per = "Persian", deu = "German",
    fra = "French", sl = "Slovenian", slv = "Slovenian", sk = "Slovak", slk = "Slovak",
    hr = "Croatian", hrv = "Croatian", sr = "Serbian", srp = "Serbian",
}

local function language_name(track)
    local code = tostring(track.lang or "und"):lower():gsub("_", "-")
    for _,name in pairs(language_names) do if name:lower()==code then return name end end
    return language_names[code] or language_names[code:match("^[^-]+")]
        or (code == "und" and "Unspecified language" or ("Other (" .. code:upper() .. ")"))
end

local function track_row(parts, x, y, w, name, description, action, selected)
    rounded(parts,x,y,w,44,selected and C.purple or C.surface,selected and 0xBC or 0x30)
    label(parts,x+12,y+6,shorten(name,math.floor((w-44)/8)),15)
    label(parts,x+12,y+26,shorten(description,math.floor((w-36)/7)),11,C.muted)
    if selected then rectangle(parts,x+w-23,y+19,6,6,C.purple) end
    hit(x,y,w,44,action)
end

local function subtitle_languages(tracks)
    local result, seen = {}, {}
    for _, track in ipairs(tracks) do
        local name = language_name(track)
        if not seen[name] then
            result[#result + 1] = name
            seen[name] = true
        end
    end
    table.sort(result,function(a,b) return a:lower()<b:lower() end)
    return result
end

local function select_panel(name)
    panel = panel == name and nil or name
    if panel=="subtitles" then language=nil; language_page=0; variant_page=0 end
    if panel=="episodes" then
        season=tonumber(ui.season) or season
        for _,item in ipairs(ui.episodes or {}) do
            if item.id==ui.currentVideoId then season=tonumber(item.season) or season; break end
        end
        episode_focus_pending=true
    end
    skip_prompt.last_input = mp.get_time()
end

local function render_subtitles(parts)
    local tracks = tracks_of("sub")
    local loaded = {}
    for _,id in ipairs(ui.loadedAddonSubtitles or {}) do loaded[id]=true end
    for _,item in ipairs(ui.addonSubtitles or {}) do
        if not loaded[item.id] then
            tracks[#tracks+1]={ addonId=item.id,lang=item.lang,title=item.label,external=true }
        end
    end
    local groups=subtitle_languages(tracks)
    local variants={}
    for _,track in ipairs(tracks) do
        if language_name(track)==language then variants[#variants+1]=track end
    end
    if language and #variants==0 then language=nil end
    local entries=language and variants or groups
    local total=#entries+(language and 0 or 1)
    local page_size = math.max(1, math.min(5, math.floor((height-230)/50)))
    local max_page = math.max(0, total-page_size)
    local page=clamp(language and variant_page or language_page,0,max_page)
    if language then variant_page=page else language_page=page end
    local count = math.min(page_size,total-page)
    local pw = math.min(360,width-48)
    local ph = 70+count*50+(language and 28 or 0)
    local px,py = width-pw-30,height-ph-106
    hit(0,0,width,height,function() panel=nil end)
    rounded(parts,px,py,pw,ph,C.background,0x08)
    label(parts,px+18,py+18,language and shorten(language,18) or "Subtitles",16)
    label(parts,px+pw-16,py+18,"Subtitle settings",14,C.purple,9)
    hit(px+pw-144,py+8,132,36,function() panel="subtitle-settings" end)
    if language then button(parts,px+14,py+42,pw-28,28,"<  Languages",function() language=nil; variant_page=0 end) end
    local top=language and 76 or 48
    for row=1,count do
        local index=page+row-(language and 0 or 1)
        local track = language and variants[index] or nil
        local y = py+top+(row-1)*50
        if not language and index == 0 then
            track_row(parts,px+14,y,pw-28,"Off","",function() mp.set_property("sid","no"); panel=nil end,mp.get_property("sid") == "no")
        elseif not language then
            local name=groups[index]
            local selected=false
            local matches=0
            for _,item in ipairs(tracks) do
                if language_name(item)==name then
                    matches=matches+1
                    if item.id and mp.get_property_number("sid",-1)==item.id then selected=true end
                end
            end
            track_row(parts,px+14,y,pw-28,name,tostring(matches)..(matches==1 and " track" or " tracks"),
                function() language=name; variant_page=0 end,selected)
        else
            local id = track.id
            local description = (track.external and "External" or "Embedded") .. (track.codec and (" / " .. track.codec:upper()) or "")
            if track["hearing-impaired"] then description = description .. " / SDH" end
            if track.forced then description = description .. " / Forced" end
            track_row(parts,px+14,y,pw-28,track.title and track.title~="" and track.title or (language.." "..index),description,
                function()
                    if track.addonId then
                        if not has_played then return end
                        mp.commandv("script-message","rainflix-subtitle",track.addonId)
                    else mp.set_property_number("sid",id); panel=nil end
                end,mp.get_property_number("sid",-1) == id)
        end
    end
    list_scrollbar(parts,px+pw-7,py+top,py+top+count*50,total,page,page_size,function(value) if language then variant_page=value else language_page=value end end)
end

local function render_subtitle_settings(parts)
    local pw = math.min(300,width-48)
    local px,py = width-pw-30,math.max(16,height-370)
    hit(0,0,width,height,function() panel=nil end)
    rounded(parts,px,py,pw,264,C.background,0x08)
    button(parts,px+14,py+14,pw-28,36,"<  Subtitle settings",function() panel="subtitles" end)
    local settings = {
        { title="Delay",property="sub-delay",step=0.25,min=-30,max=30,display=function(v) return string.format("%+.2f s",v) end },
        { title="Size",property="sub-scale",step=0.1,min=0.5,max=3,display=function(v) return string.format("%.0f%%",v*100) end },
        { title="Vertical position",property="sub-pos",step=5,min=0,max=100,display=function(v) return string.format("%.0f%%",100-v) end },
    }
    for index,item in ipairs(settings) do
        local y = py+58+(index-1)*64
        local current = mp.get_property_number(item.property,item.property == "sub-scale" and 1 or (item.property == "sub-pos" and 100 or 0))
        label(parts,px+22,y,item.title,15,C.muted)
        button(parts,px+16,y+24,44,36,"-",function() mp.set_property_number(item.property,clamp(current-item.step,item.min,item.max)) end)
        label(parts,px+pw/2,y+42,item.display(current),17,C.white,5)
        button(parts,px+pw-60,y+24,44,36,"+",function() mp.set_property_number(item.property,clamp(current+item.step,item.min,item.max)) end)
    end
end

local function render_audio(parts)
    local tracks = tracks_of("audio")
    local pw = math.min(300, width - 32)
    local page_size = math.max(1, math.min(7, math.floor((height - 228) / 48)))
    local max_page = math.max(0, #tracks - page_size)
    audio_page = clamp(audio_page, 0, max_page)
    local visible_count = math.min(page_size, #tracks)
    local ph = math.min(height - 120, 76 + math.max(1, visible_count) * 48)
    local px = width - pw - 30
    local py = height - ph - 106
    hit(0, 0, width, height, function() panel = nil end)
    rounded(parts, px, py, pw, ph, C.background, 0x08)
    label(parts, px + 20, py + 18, "Audio tracks", 16)
    if #tracks == 0 then label(parts, px + 24, py + 76, "No audio tracks", 17, C.muted) end
    for index = audio_page + 1,
        math.min(#tracks, audio_page + page_size) do
        local track = tracks[index]
        local id = track.id
        local name = language_name(track)
        button(parts, px + 16, py + 56 + (index - audio_page - 1) * 48, pw - 32, 42,
            shorten(name .. (track.title and (" / " .. track.title) or ""), math.floor((pw-40)/9)), function() mp.set_property_number("aid", id) end,
            mp.get_property_number("aid", -1) == id)
    end
    list_scrollbar(parts,px+pw-7,py+56,py+56+visible_count*48,#tracks,audio_page,page_size,function(value) audio_page=value end)
end

local function render_speed(parts)
    local values = { 0.5, 0.75, 1, 1.25, 1.5, 2 }
    local pw=math.min(240,width-48)
    local px = width-pw-30
    local py = math.max(16,height-300)
    hit(0, 0, width, height, function() panel = nil end)
    rounded(parts, px, py, pw, 194, C.background, 0x08)
    label(parts, px + 18, py + 18, "Playback speed", 16)
    for index, speed in ipairs(values) do
        button(parts, px + 12 + ((index-1)%2)*(pw/2-6), py + 48 + math.floor((index - 1)/2) * 44, pw/2-18, 38,
            string.format("%gx", speed), function() mp.set_property_number("speed", speed) end,
            math.abs(mp.get_property_number("speed", 1) - speed) < 0.01)
    end
end

local function season_episodes()
    local result = {}
    for _, item in ipairs(ui.episodes or {}) do
        if tonumber(item.season) == season then result[#result + 1] = item end
    end
    return result
end

local function seasons()
    local result, seen = {}, {}
    for _, value in ipairs(ui.seasons or {}) do
        result[#result+1] = value
        seen[value] = true
    end
    for _, item in ipairs(ui.episodes or {}) do
        local value = tonumber(item.season)
        if value and not seen[value] then
            result[#result + 1] = value
            seen[value] = true
        end
    end
    table.sort(result)
    return result
end

local function choose_season(value)
    episode_focus_pending=false
    season = value
    episode_page = 0
    panel = "episodes"
    mp.commandv("script-message", "rainflix-episode", tostring(value), "season")
end

local function render_seasons(parts)
    local pw = math.min(470,width-24)
    local px = width-pw
    hit(0,0,width,height,function() panel=nil end)
    rectangle(parts,px,0,pw,height,C.background,0x05)
    button(parts,px+18,20,44,44,"<",function() panel="episodes" end)
    label(parts,px+78,40,"Choose season",20)
    local items = seasons()
    local count = math.max(1,math.floor((height-160)/56))
    local max_page = math.max(0,math.ceil(#items/count)-1)
    season_page = clamp(season_page,0,max_page)
    for index=season_page*count+1,math.min(#items,(season_page+1)*count) do
        local value=items[index]
        button(parts,px+18,86+(index-season_page*count-1)*56,pw-36,48,"Season "..value,function() choose_season(value) end)
    end
    if max_page>0 then
        button(parts,px+18,height-60,70,40,"Prev",function() season_page=math.max(0,season_page-1) end)
        button(parts,width-88,height-60,70,40,"Next",function() season_page=math.min(max_page,season_page+1) end)
    end
end

local function render_episodes(parts)
    local pw = math.min(580, width - 24)
    local px = width - pw
    hit(0, 0, width, height, function() panel = nil end)
    rectangle(parts, px, 0, pw, height, C.background, 0x05)
    label(parts, px + 26, 30, shorten(ui.title or "Episodes", 38), 20)
    button(parts, width - 57, 18, 38, 38, "X", function() panel = nil end)
    local all_seasons = seasons()
    local season_index = 1
    for index, value in ipairs(all_seasons) do
        if value == season then season_index = index end
    end
    button(parts, px + 22, 88, 50, 40, "<", function()
        choose_season(all_seasons[math.max(1, season_index - 1)] or season)
    end)
    button(parts,px+82,88,pw-164,40,"Season "..season,function() panel="seasons"; season_page=0 end)
    button(parts, width - 72, 88, 50, 40, ">", function()
        choose_season(all_seasons[math.min(#all_seasons, season_index + 1)] or season)
    end)
    local episodes = season_episodes()
    local page_size = math.max(1, math.min(30,math.floor((height - 186) / 126)))
    local max_page = math.max(0, #episodes - page_size)
    if episode_focus_pending then
        for index,item in ipairs(episodes) do
            if item.id==ui.currentVideoId then
                episode_page=clamp(index-1-math.floor((page_size-1)/2),0,max_page)
                episode_focus_pending=false
                break
            end
        end
    end
    episode_page = clamp(episode_page, 0, max_page)
    for index = episode_page + 1,
        math.min(#episodes, episode_page + page_size) do
        local item = episodes[index]
        local y = 150 + (index - episode_page - 1) * 126
        local selected = item.id == ui.currentVideoId
        if selected or hovered(px+18,y,pw-46,118) then
            rounded(parts, px+18,y,pw-46,118,selected and C.purple or C.surface,selected and 0xC0 or 0x38)
        end
        if item.image and item.image.path then
            local art = item.image
            bitmap({ name="overlay-add",id=30+index-episode_page,x=math.floor(px+26),y=y+22,file=art.path,offset=0,fmt="bgra",
                w=art.width,h=art.height,stride=art.width*4,dw=128,dh=72 })
        else
            rounded(parts,px+26,y+22,128,72,C.surface,0x20)
        end
        local lines=wrap_lines(tostring(item.episode or index)..". "..tostring(item.title or "Episode"),math.max(8,math.floor((pw-206)/12)))
        for line=1,math.min(3,#lines) do
            label(parts,px+172,y+12+(line-1)*25,line==3 and #lines>3 and shorten(lines[line],#lines[line]-3).."..." or lines[line],17)
        end
        if item.date and item.date ~= "" then
            label(parts, px + 172, y + 92, shorten(item.date, 30), 13, C.muted)
        end
        hit(px + 18, y, pw - 46, 118, function()
            stream_video = item.id
            stream_choices = nil
            stream_page = 0
            stream_provider = nil
            stream_request = stream_request + 1
            panel = "streams"
            mp.commandv("script-message", "rainflix-episode", item.id, "choose", tostring(stream_request))
        end)
    end
    if #episodes == 0 then
        local state = ui.episodeStatus
        local status = state and tonumber(state.season)==season and state.status or "loading"
        label(parts,px+26,164,status=="error" and "Could not load episodes" or status=="ready" and "No episodes available" or "Loading episodes...",18,C.muted)
        if status=="error" then button(parts,px+26,204,90,40,"Retry",function() choose_season(season) end) end
    end
    list_scrollbar(parts,width-15,150,height-30,#episodes,episode_page,page_size,function(value) episode_page=value end)
end

local function render_streams(parts)
    local pw = math.min(580,width-24)
    local px = width-pw
    hit(0,0,width,height,function() panel=nil end)
    rectangle(parts,px,0,pw,height,C.background,0x05)
    button(parts,px+18,20,44,44,"<",function()
        if stream_provider then stream_provider=nil; stream_page=0
        else panel="episodes" end
    end)
    label(parts,px+78,40,stream_provider and "Choose stream" or "Choose provider",20)
    if not stream_choices then
        label(parts,px+26,100,"Finding available streams...",17,C.muted)
        return
    end
    if #stream_choices == 0 then label(parts,px+26,100,"No streams available",17,C.muted) end
    local items, providers = {}, {}
    for _, item in ipairs(stream_choices) do
        local provider = tostring(item.providerId or "default")
        if stream_provider then
            if provider == stream_provider then items[#items+1]=item end
        elseif not providers[provider] then
            providers[provider]=true
            items[#items+1]={ provider=provider, label=item.providerLabel or "Streams",image=item.providerImage,count=0 }
        end
    end
    if not stream_provider then
        for _,item in ipairs(items) do
            for _,source in ipairs(stream_choices) do if tostring(source.providerId or "default")==item.provider then item.count=item.count+1 end end
        end
    end
    stream_item_count = #items
    local top,bottom=86,height-24
    local total=0
    for _,item in ipairs(items) do
        local wrap_width=math.max(8,math.floor((pw-(item.provider and 148 or 84))/11))
        if item.wrap_width~=wrap_width then
            item.lines=wrap_lines(item.heading or item.label or "Stream",wrap_width)
            item.heading_lines=#item.lines
            if item.provider then item.lines[#item.lines+1]=tostring(item.count).." sources"
            else
                if item.badges and #item.badges>0 then item.lines[#item.lines+1]=table.concat(item.badges,"  ·  ") end
                for _,line in ipairs(wrap_lines(item.details or "",wrap_width)) do if line~="" then item.lines[#item.lines+1]=line end end
            end
            item.wrap_width=wrap_width
        end
        item.row_height=math.max(86,#item.lines*24+28)
        total=total+item.row_height+8
    end
    stream_page=clamp(stream_page,0,math.max(0,total-(bottom-top)))
    local y=top-stream_page
    for index,item in ipairs(items) do
        local row_y=y
        y=y+item.row_height+8
        if row_y+item.row_height>top and row_y<bottom then
        local first=math.max(top,row_y)
        local last=math.min(bottom,row_y+item.row_height)
        if hovered(px+18,first,pw-46,last-first) then rounded(parts,px+18,first,pw-46,last-first,C.surface,0x28) end
        local text_x=px+30
        if item.provider then
            text_x=px+94
            if row_y>=top and row_y+64<=bottom then
                if item.image and item.image.path then
                    local art=item.image
                    bitmap({name="overlay-add",id=60+index,x=math.floor(px+30),y=math.floor(row_y+20),file=art.path,offset=0,fmt="bgra",
                        w=art.width,h=art.height,stride=art.width*4,dw=art.width,dh=art.height})
                else
                    rounded(parts,px+30,row_y+16,46,46,C.row,0x20)
                    label(parts,px+45,row_y+23,tostring(item.label):sub(1,1):upper(),24,C.purple)
                end
            end
        end
        for line,text in ipairs(item.lines) do
            local ly=row_y+14+(line-1)*24
            if ly>=top and ly+23<=bottom then label(parts,text_x,ly,text,line<=item.heading_lines and 18 or 15,line<=item.heading_lines and C.white or C.muted) end
        end
        if row_y+item.row_height<bottom then rectangle(parts,px+30,row_y+item.row_height,pw-76,1,C.row,0x70) end
        hit(px+18,first,pw-46,last-first,function()
            if item.provider then
                local matches = {}
                for _, source in ipairs(stream_choices) do
                    if tostring(source.providerId or "default")==item.provider then matches[#matches+1]=source end
                end
                if #matches==1 then mp.commandv("script-message","rainflix-episode",stream_video,"source",matches[1].id)
                else stream_provider=item.provider; stream_page=0 end
            else mp.commandv("script-message","rainflix-episode",stream_video,"source",item.id) end
        end)
        end
    end
    list_scrollbar(parts,width-15,top,bottom,total,stream_page,bottom-top,function(value) stream_page=value end)
end

local function chapter_at(position)
    local chapters = mp.get_property_native("chapter-list") or {}
    local current
    for index, item in ipairs(chapters) do
        if tonumber(item.time) and item.time <= position then current = index end
    end
    return chapters, current
end

local function skip_chapter(position, duration)
    local chapters, index = chapter_at(position)
    if not index then return nil end
    local title = tostring(chapters[index].title or ""):lower():gsub("[^%w]", " ")
    local kind
    for word in title:gmatch("%w+") do
        if word == "intro" or word == "opening" or word:match("^op%d*$") then kind = "Skip intro"; break
        elseif word == "ending" or title == "end" or word == "outro" or word == "credits" or word:match("^ed%d*$") then kind = "Skip ending"; break
        elseif word == "recap" then kind = "Skip recap"; break end
    end
    local target = chapters[index + 1] and tonumber(chapters[index + 1].time) or duration
    if not kind or not target or target <= position or duration <= 0 then return nil end
    local start = tonumber(chapters[index].time) or 0
    if start < 0 or target > duration or target-start > math.min(300,duration/4) then return nil end
    if kind=="Skip ending" then
        if start < duration*.65 then return nil end
    elseif start > math.min(300,duration/4) or target >= duration-math.min(30,duration/20) then return nil end
    return { title = kind, time = math.min(target, duration), index=index }
end

local function next_episode()
    for index,item in ipairs(ui.episodes or {}) do
        if item.id == ui.currentVideoId then return ui.episodes[index+1] end
    end
end

local function preload_label()
    if not skip_options.preload then return "Preload off" end
    local status=ui.preloadStatus or {}
    if status.status=="ready" then return "Ready - cached" end
    if status.status=="buffering" then return "Buffering "..math.floor(tonumber(status.percent) or 0).."%" end
    if status.status=="lookup" then return "Finding next stream" end
    if status.status=="metadata" then return "Connecting to peers" end
    if status.status=="failed" then return "Preload failed - Next retries" end
    if status.status=="unavailable" then return "No matching next stream" end
    if status.status=="unsupported" then return "Torrent preloading only" end
    if status.status=="cancelled" then return "Preload cancelled" end
    return ""
end

local function render_settings(parts)
    local pw=math.min(340,width-48)
    local ph=172
    local px,py=width-pw-24,math.max(20,height-ph-110)
    hit(0,0,width,height,function() panel=nil end)
    rounded(parts,px,py,pw,ph,C.background,0x12)
    label(parts,px+20,py+18,"Playback settings",16)
    local rows={{key="intro",title="Auto-skip intro"},{key="outro",title="Auto-skip outro"}}
    for index,item in ipairs(rows) do
        local y=py+52+(index-1)*50
        local active=skip_options[item.key]
        if hovered(px+12,y,pw-24,46) then rounded(parts,px+12,y,pw-24,46,C.surface,0x20) end
        label(parts,px+20,y+14,item.title,15)
        rounded(parts,px+pw-78,y+14,52,28,active and C.purple or C.row,0)
        circle(parts,px+pw-78+(active and 38 or 14),y+28,11,C.white)
        hit(px+12,y,pw-24,46,function()
            skip_options[item.key]=not skip_options[item.key]
            mp.commandv("script-message","rainflix-settings",utils.format_json({ skipIntro=skip_options.intro,skipOutro=skip_options.outro }))
        end)
    end
end

local function render_next_episode(parts,item,remaining)
    local pw=math.min(540,width-48)
    local ph=204
    local px,py=width-pw-24,math.max(100,height-ph-150)
    rounded(parts,px,py,pw,ph,hovered(px,py,pw,ph) and C.surface or C.background,0x28)
    label(parts,px+16,py+12,"Up next",18,C.purple)
    label(parts,px+pw-16,py+22,preload_label(),14,C.muted,6)
    local art=item.image or ui.backdrop or ui.logo
    if art and art.path then
        local scale=math.min(208/art.width,117/art.height)
        local dw,dh=math.floor(art.width*scale),math.floor(art.height*scale)
        bitmap({name="overlay-add",id=22,x=math.floor(px+16+(208-dw)/2),y=math.floor(py+60+(117-dh)/2),file=art.path,offset=0,fmt="bgra",
            w=art.width,h=art.height,stride=art.width*4,dw=dw,dh=dh})
    end
    label(parts,px+240,py+54,"S"..tostring(item.season or 1).." E"..tostring(item.episode or 1),16,C.muted)
    local lines=wrap_lines(item.title or "Next episode",math.max(8,math.floor((pw-264)/12)))
    for line=1,math.min(3,#lines) do label(parts,px+240,py+84+(line-1)*27,lines[line],18) end
    label(parts,px+240,py+174,format_time(remaining).." remaining",13,C.muted)
    hit(px,py,pw,ph,function() mp.commandv("script-message","rainflix-episode",item.id) end)
end

local function render_chapters(parts)
    local chapters = mp.get_property_native("chapter-list") or {}
    local pw = math.min(410, width - 48)
    local ph = math.min(height - 180, 440)
    local px, py = width - pw - 30, height - ph - 110
    hit(0,0,width,height,function() panel=nil end)
    rounded(parts,px,py,pw,ph,C.background,0x05)
    label(parts,px+22,py+22,"Chapters",20)
    icon_button(parts,px+pw-52,py+14,36,36,"close","Close",function() panel=nil end)
    local page_size = math.max(1,math.floor((ph-116)/48))
    local max_page = math.max(0,math.ceil(#chapters/page_size)-1)
    chapter_page = clamp(chapter_page,0,max_page)
    local _, current = chapter_at(mp.get_property_number("time-pos",0))
    for index = chapter_page*page_size+1,math.min(#chapters,(chapter_page+1)*page_size) do
        local item = chapters[index]
        local time = tonumber(item.time) or 0
        local y = py+65+(index-chapter_page*page_size-1)*48
        rounded(parts,px+14,y,pw-28,42,index == current and C.purple or C.surface,index == current and 0xBC or 0x30)
        label(parts,px+28,y+21,shorten(item.title or ("Chapter " .. index),math.floor((pw-120)/9)),16,C.white,4)
        label(parts,px+pw-26,y+21,format_time(time),14,C.muted,6)
        hit(px+14,y,pw-28,42,function() mp.commandv("seek",time,"absolute+exact"); panel=nil end)
    end
    if max_page > 0 then
        button(parts,px+14,py+ph-44,62,32,"Prev",function() chapter_page=math.max(0,chapter_page-1) end)
        label(parts,px+pw/2,py+ph-28,string.format("%d / %d",chapter_page+1,max_page+1),14,C.muted,5)
        button(parts,px+pw-76,py+ph-44,62,32,"Next",function() chapter_page=math.min(max_page,chapter_page+1) end)
    end
end

local function buffering_state()
    if smoke_buffer then return smoke_buffer.active, smoke_buffer.percent end
    local active = not ready or mp.get_property_bool("paused-for-cache",false) or mp.get_property_bool("seeking",false)
    local percent = mp.get_property_number("cache-buffering-state",0)
    return active, clamp(percent,0,100)
end

local function render_buffer(parts, active, percent, elapsed)
    activity_x=nil
    local paused = ready and mp.get_property_bool("pause",false) and not active
    if (not active and not paused) or panel then
        return
    end
    if active and not has_played and ui.backdrop and ui.backdrop.path then
        local art = ui.backdrop
        local scale = math.max(width/art.width,height/art.height)
        local dw,dh = math.floor(art.width*scale),math.floor(art.height*scale)
        bitmap({ name="overlay-add",id=19,x=math.floor((width-dw)/2),y=math.floor((height-dh)/2),file=art.path,offset=0,fmt="bgra",
            w=art.width,h=art.height,stride=art.width*4,dw=dw,dh=dh })
    end
    rectangle(parts,0,0,width,height,C.background,0x58)
    if not was_buffering then buffer_fill = 0 end
    buffer_fill = paused and 100 or math.min(percent,buffer_fill+(percent-buffer_fill)*(1-math.exp(-elapsed*4)))
    local pulse = 1+0.012*math.sin(mp.get_time()*math.pi*2/4.2)
    local logo = ui.logo
    if logo and logo.path then
        local scale = math.min(1,(width-80)/logo.width,(height-220)/logo.height)
        local dw, dh = math.floor(logo.width*scale), math.floor(logo.height*scale)
        local x, y = math.floor((width-dw)/2), math.floor((height-dh)/2)
        bitmap({ name="overlay-add", id=20,x=x,y=y,file=logo.dimPath,offset=0,fmt="bgra",
            w=logo.width,h=logo.height,stride=logo.width*4,dw=dw,dh=dh })
        local fill = math.floor(logo.width*buffer_fill/100)
        if fill > 0 then
            bitmap({ name="overlay-add", id=21,x=x,y=y,file=logo.path,offset=0,fmt="bgra",
                w=fill,h=logo.height,stride=logo.width*4,dw=math.max(1,math.floor(fill*scale)),dh=dh })
        end
    else
        local text = "R"
        local tw = math.min(width-80,#text*18)
        label(parts,width/2,height/2,text,32*pulse,C.white,5,0xBF)
        label(parts,width/2,height/2,text,32*pulse,C.white,5)
        parts[#parts] = string.format("{\\clip(%g,%g,%g,%g)}",(width-tw)/2,height/2-40,(width-tw)/2+tw*buffer_fill/100,height/2+40) .. parts[#parts]
    end
    if active then
        local track=math.min(220,width-80)
        local y=math.min(height-150,height/2+(logo and logo.height or 72)/2+28)
        local x=(width-track)/2
        local phase=(1-math.cos(mp.get_time()*math.pi*2/3.6))/2
        activity_x=x+(track-42)*phase
        rounded(parts,x,y,track,3,C.white,0xCC)
        rounded(parts,activity_x,y,42,3,C.purple,0x18)
    end
end

local function render()
    width, height = mp.get_osd_size()
    if not width or not height or width < 320 or height < 220 then return end
    local parts = {}
    hitboxes = {}
    wanted_bitmaps = {}
    local now = mp.get_time()
    local elapsed = math.min(0.25,now-last_render)
    last_render = now
    local buffering, percent = buffering_state()
    render_buffer(parts,buffering,percent,elapsed)
    was_buffering = buffering
    local position = mp.get_property_number("time-pos",0)
    local duration = mp.get_property_number("duration",0)
    local chapters, current_chapter = chapter_at(position)
    local skip = skip_chapter(position,duration)
    if skip and not restoring_tracks and not buffering and not panel and not mp.get_property_bool("pause",false)
        and ((skip.title=="Skip intro" and skip_options.intro) or (skip.title=="Skip ending" and skip_options.outro))
        and skipped_chapter~=skip.index then
        skipped_chapter=skip.index
        mp.commandv("seek",skip.time,"absolute+exact")
    end
    if not skip then skipped_chapter=nil end
    local remaining=duration-position
    local upcoming=next_episode()
    if preload_video and (not skip_options.preload or buffering) then
        mp.commandv("script-message","rainflix-episode",preload_video,"cancel-preload")
        preload_video=nil; preload_retry_at=mp.get_time()+15
    end
    if skip_options.preload and upcoming and has_played and duration>0
        and not restoring_tracks and not buffering and not panel and not mp.get_property_bool("pause",false)
        and not preload_video and mp.get_time()>=preload_retry_at then
        preload_video=upcoming.id
        mp.commandv("script-message","rainflix-episode",upcoming.id,"preload")
    end
    local show_next=skip_options.preview and upcoming and has_played and height>=540 and width>=400 and duration>0 and remaining>0
        and (remaining<=math.min(30,duration*0.1) or (skip and skip.title=="Skip ending" and remaining<=120))
    local visible = panel or mp.get_time() - skip_prompt.last_input < 4
    if visible then
        for band=0,11 do
            rectangle(parts,0,band*8,width,8,C.background,0x20+band*17)
            rectangle(parts,0,height-144+band*12,width,12,C.background,0xDB-band*17)
        end
        icon_button(parts, 24, 24, 48, 44, "back", "Back to title", function()
            mp.commandv("quit")
        end)
        if not buffering then
            label(parts, 88, 30, shorten(ui.title or "RainFlix", math.floor((width - 180) / 11)), 20)
            label(parts,88,57,"RainFlix",12,C.muted)
        end
        icon_button(parts, width - 70, 24, 48, 44, "fullscreen", "Fullscreen", function()
            mp.commandv("script-message", "rainflix-fullscreen")
        end)

        local sx, sw, sy = 126, width - 252, height - 82
        label(parts, 24, sy, format_time(position), 17, C.white)
        label(parts, width - 102, sy, format_time(duration), 17, C.white)
        rectangle(parts, sx, sy + 7, sw, 6, C.muted, 0x95)
        if duration > 0 then
            for _, range in ipairs((mp.get_property_native("demuxer-cache-state") or {})["seekable-ranges"] or {}) do
                local a = clamp((tonumber(range.start) or 0)/duration,0,1)*sw
                local b = clamp((tonumber(range["end"]) or 0)/duration,0,1)*sw
                rectangle(parts,sx+a,sy+7,b-a,6,C.white,0x85)
            end
            local fill = clamp(position / duration, 0, 1) * sw
            rectangle(parts, sx, sy + 7, fill, 6, C.purple, 0)
            circle(parts,sx+fill,sy+10,8,C.purple)
            circle(parts,sx+fill,sy+10,4,C.white)
            hit(sx, sy - 12, sw, 36, function(x)
                mp.commandv("seek", tostring(clamp((x - sx) / sw, 0, 1) * duration), "absolute+exact")
            end)
            for _, chapter in ipairs(chapters) do
                local x = sx+clamp((tonumber(chapter.time) or 0)/duration,0,1)*sw
                rectangle(parts,x,sy+5,2,10,C.background,0x10)
            end
            if hovered(sx,sy-12,sw,36) then
                local mouse = mp.get_property_native("mouse-pos") or {}
                local time = clamp((mouse.x-sx)/sw,0,1)*duration
                local _, index = chapter_at(time)
                local text = format_time(time) .. (index and (" / " .. tostring(chapters[index].title or ("Chapter " .. index))) or "")
                label(parts,clamp(mouse.x,160,width-160),sy-22,shorten(text,40),14,C.white,5)
            elseif current_chapter then
                label(parts,sx,sy-22,shorten(chapters[current_chapter].title or "",60),14,C.muted)
            end
        end

        local by = height - 58
        icon_button(parts, 24, by, 56, 44, mp.get_property_bool("pause", false) and "play" or "pause", "Play / pause",
            function() mp.commandv("cycle", "pause") end)
        icon_button(parts, 82, by, 44, 44, "rewind", "Back 5 seconds", function() mp.commandv("seek", -5, "relative+exact") end)
        icon_button(parts, 128, by, 44, 44, "forward", "Forward 5 seconds", function() mp.commandv("seek", 5, "relative+exact") end)
        icon_button(parts, 174, by, 44, 44, mp.get_property_bool("mute", false) and "mute" or "volume", "Mute / volume",
            function() mp.commandv("cycle", "mute") end)
        local volume = clamp(mp.get_property_number("volume", 100), 0, 100)
        rectangle(parts, 228, by + 19, 80, 5, C.muted, 0x80)
        rectangle(parts, 228, by + 19, volume * .8, 5, C.purple, 0)
        circle(parts,228+volume*.8,by+21.5,7,C.white)
        hit(222, by + 4, 92, 36, function(x)
            mp.set_property_number("volume", clamp((x - 228) / 80 * 100, 0, 100))
            mp.set_property_bool("mute", false)
        end)
        local right = width - 26
        local function right_button(text, name, action)
            right = right - 56
            icon_button(parts, right, by, 48, 44, name, text, action, panel == name)
        end
        right_button("Playback settings", "settings", function() select_panel("settings") end)
        if ui.episodes and #ui.episodes > 0 then
            right_button("Episodes", "episodes", function() select_panel("episodes") end)
        end
        right_button("Audio", "audio", function() select_panel("audio") end)
        right_button("CC", "subtitles", function() select_panel("subtitles") end)
        right_button(string.format("%gx", mp.get_property_number("speed", 1)), "speed",
            function() select_panel("speed") end)
        local current_index
        for index,item in ipairs(ui.episodes or {}) do if item.id == ui.currentVideoId then current_index=index end end
        if current_index then
            local previous,next_episode = ui.episodes[current_index-1],ui.episodes[current_index+1]
            if previous then button(parts,326,by,56,44,"Prev",function() mp.commandv("script-message","rainflix-episode",previous.id) end) end
            if next_episode then button(parts,388,by,56,44,"Next",function() mp.commandv("script-message","rainflix-episode",next_episode.id) end) end
        end
    end

    if skip and not panel and not buffering and visible then
        local y=show_next and height-430 or height-184
        rounded(parts,width-252,y,226,50,C.background,0x50)
        button(parts,width-252,y,226,50,skip.title,function()
            mp.commandv("seek",skip.time,"absolute+exact")
        end)
    end
    if show_next and not panel and not buffering then render_next_episode(parts,upcoming,remaining) end
    if visible and upcoming and not panel and not buffering and preload_label()~="" then
        rounded(parts,126,height-155,290,30,C.background,0x40)
        label(parts,140,height-140,preload_label(),15,C.muted,4)
    end

    if panel == "subtitles" then render_subtitles(parts)
    elseif panel == "subtitle-settings" then render_subtitle_settings(parts)
    elseif panel == "audio" then render_audio(parts)
    elseif panel == "speed" then render_speed(parts)
    elseif panel == "episodes" then render_episodes(parts)
    elseif panel == "seasons" then render_seasons(parts)
    elseif panel == "streams" then render_streams(parts)
    elseif panel == "settings" then render_settings(parts)
    elseif panel == "chapters" then render_chapters(parts)
    end
    for id in pairs(bitmap_cache) do
        if not wanted_bitmaps[id] then
            mp.commandv("overlay-remove",id)
            bitmap_cache[id]=nil
        end
    end
    local data = table.concat(parts, "\n")
    if overlay.data ~= data or overlay.res_x ~= width or overlay.res_y ~= height then
        overlay.res_x = width
        overlay.res_y = height
        overlay.data = data
        overlay:update()
    end
    if os.getenv("RAINFLIX_NATIVE_SMOKE_MEDIA") then
        mp.set_property_native("user-data/rainflix",{ buffering=buffering,percent=percent,fill=buffer_fill,
            logo=ui.logo ~= nil and ui.logo.path ~= nil, skip=skip, panel=panel,
            skipPromptVisible=skip~=nil and not panel and not buffering and visible and true or false,
            languages=subtitle_languages(tracks_of("sub")),mouse=mp.get_property_native("mouse-pos"),size={w=width,h=height},season=season,
            subtitleLanguage=language,subtitleVariants=language and (function()
                local count=0
                for _,track in ipairs(tracks_of("sub")) do if language_name(track)==language then count=count+1 end end
                return count
            end)() or 0,
            bitmapUploads=bitmap_uploads,streamCount=stream_choices and #stream_choices or 0,
            streamItemCount=stream_item_count,streamProvider=stream_provider,
            episodeCount=#season_episodes(),
            skipOptions=skip_options,nextEpisode=show_next and upcoming.id or nil,preloadVideo=preload_video,preloadStatus=ui.preloadStatus,
            episodeOffset=episode_page,streamOffset=stream_page,
            activityX=activity_x,
            hasPlayed=has_played,backdropVisible=wanted_bitmaps[19] == true })
    end
end

local function reveal()
    skip_prompt.last_input = mp.get_time()
    render()
end

local function adjacent_episode(offset)
    if panel then return end
    for index,item in ipairs(ui.episodes or {}) do
        if item.id == ui.currentVideoId then
            local target = ui.episodes[index+offset]
            if target then mp.commandv("script-message","rainflix-episode",target.id) end
            break
        end
    end
    reveal()
end

local function navigate_or_seek(offset)
    if panel == "episodes" then episode_focus_pending=false; episode_page = math.max(0,episode_page+offset)
    elseif panel == "seasons" then season_page = math.max(0,season_page+offset)
    elseif panel == "streams" then stream_page = math.max(0,stream_page+offset*80)
    elseif panel == "audio" then audio_page = math.max(0,audio_page+offset)
    elseif panel == "subtitles" then
        if language then variant_page=math.max(0,variant_page+offset) else language_page=math.max(0,language_page+offset) end
    elseif not panel then mp.commandv("seek",tostring(offset*10),"relative") end
    reveal()
end

local function playback_key(key,name,action,repeatable)
    mp.add_forced_key_binding(key,"rainflix-"..name,function()
        if not panel then action() end
        reveal()
    end,{repeatable=repeatable or false})
end

mp.add_forced_key_binding("MOUSE_MOVE", "rainflix-mouse-move", reveal)
mp.add_forced_key_binding("MBTN_LEFT", "rainflix-click", function()
    local pos = mp.get_property_native("mouse-pos") or {}
    if not pos.hover then return end
    reveal()
    for index = #hitboxes, 1, -1 do
        local box = hitboxes[index]
        if pos.x >= box.x and pos.x <= box.x + box.w and
            pos.y >= box.y and pos.y <= box.y + box.h then
            box.action(pos.x, pos.y)
            reveal()
            return
        end
    end
    if panel then panel = nil else mp.commandv("cycle", "pause") end
    reveal()
end)
mp.add_forced_key_binding("ESC", "rainflix-escape", function()
    if panel then panel = nil else mp.commandv("quit") end
    reveal()
end)
mp.add_forced_key_binding("SPACE", "rainflix-pause", function()
    mp.commandv("cycle", "pause")
    reveal()
end)
mp.add_forced_key_binding("LEFT", "rainflix-seek-back", function()
    navigate_or_seek(-1)
end, { repeatable = true })
mp.add_forced_key_binding("RIGHT", "rainflix-seek-forward", function()
    navigate_or_seek(1)
end, { repeatable = true })
for _,key in ipairs({"UP","DOWN"}) do
    local direction=key=="UP" and -1 or 1
    mp.add_forced_key_binding(key,"rainflix-volume-"..key,function()
        if panel then navigate_or_seek(direction)
        else mp.set_property_number("volume",clamp(mp.get_property_number("volume",100)-direction*5,0,100)); reveal() end
    end,{repeatable=true})
end
playback_key("k","pause-k",function() mp.commandv("cycle","pause") end)
playback_key("m","mute-key",function() mp.commandv("cycle","mute") end)
playback_key("Shift+LEFT","seek-back-long",function() mp.commandv("seek","-60","relative") end,true)
playback_key("Shift+RIGHT","seek-forward-long",function() mp.commandv("seek","60","relative") end,true)
playback_key("[","speed-down",function() mp.set_property_number("speed",clamp(mp.get_property_number("speed",1)-0.25,0.25,3)) end,true)
playback_key("]","speed-up",function() mp.set_property_number("speed",clamp(mp.get_property_number("speed",1)+0.25,0.25,3)) end,true)
playback_key("BS","speed-reset",function() mp.set_property_number("speed",1) end)
for _,key in ipairs({"n","NEXT"}) do
    mp.add_forced_key_binding(key,"rainflix-next-"..key,function() adjacent_episode(1) end)
end
for _,key in ipairs({"p","PREV"}) do
    mp.add_forced_key_binding(key,"rainflix-prev-"..key,function() adjacent_episode(-1) end)
end
for key,name in pairs({c="subtitles",a="audio",e="episodes",s="settings"}) do
    local menu=name
    mp.add_forced_key_binding(key,"rainflix-menu-"..key,function()
        if menu~="episodes" or #(ui.seasons or {})>0 or #(ui.episodes or {})>0 then select_panel(menu) end
        reveal()
    end)
end
mp.add_forced_key_binding("f", "rainflix-fullscreen-key", function()
    mp.commandv("script-message", "rainflix-fullscreen")
    reveal()
end)
mp.add_forced_key_binding("WHEEL_UP", "rainflix-wheel-up", function()
    if panel == "episodes" then episode_focus_pending=false; episode_page = math.max(0, episode_page - 1)
    elseif panel == "streams" then stream_page = math.max(0,stream_page-80)
    elseif panel == "seasons" then season_page = math.max(0,season_page-1)
    elseif panel == "audio" then audio_page = math.max(0,audio_page-1)
    elseif panel == "subtitles" then
        if language then variant_page=math.max(0,variant_page-1) else language_page=math.max(0,language_page-1) end
    else mp.commandv("add", "volume", "5") end
    reveal()
end)
mp.add_forced_key_binding("WHEEL_DOWN", "rainflix-wheel-down", function()
    if panel == "episodes" then episode_focus_pending=false; episode_page = episode_page + 1
    elseif panel == "streams" then stream_page = stream_page+80
    elseif panel == "seasons" then season_page = season_page+1
    elseif panel == "audio" then audio_page = audio_page+1
    elseif panel == "subtitles" then
        if language then variant_page=variant_page+1 else language_page=language_page+1 end
    else mp.commandv("add", "volume", "-5") end
    reveal()
end)

mp.register_event("start-file",function() ready=false; has_played=false; skipped_chapter=nil; buffer_fill=0; reveal() end)
mp.register_event("playback-restart",function() ready=true; has_played=true; reveal() end)
mp.register_event("file-loaded", function() restore_preferences(); reveal() end)
for _,property in ipairs({ "aid","sid","sub-delay","sub-scale","sub-pos","volume","speed","mute" }) do
    mp.observe_property(property,"native",save_preferences)
end
if os.getenv("RAINFLIX_NATIVE_SMOKE_MEDIA") then
    mp.register_script_message("rainflix-smoke-reveal",reveal)
    mp.register_script_message("rainflix-smoke-preload-status",function(status,percent)
        ui.preloadStatus={id="smoke",status=status,percent=tonumber(percent) or 0}
        render()
    end)
    mp.register_script_message("rainflix-smoke-subtitle-language",function(name)
        language=name~="" and name or nil; variant_page=0; panel="subtitles"; reveal()
    end)
    mp.register_script_message("rainflix-smoke-skip-option",function(name,value)
        if skip_options[name]~=nil then
            skip_options[name]=value=="yes"
            if name=="preload" and skip_options.preload then preload_retry_at=0 end
            save_preferences(true); render()
        end
    end)
    mp.register_script_message("rainflix-smoke-panel",function(name,value)
        if name == "none" then panel=nil else panel=name end
        season = tonumber(value) or season
        if name == "episodes" and #(ui.episodes or {}) == 0 then
            ui.seasons={1,2}
            ui.episodes={ {id="smoke:1:1",season=1,episode=1,title="First episode",date="2026-10-05",image=ui.logo},
                {id="smoke:2:1",season=2,episode=1,title="Season two",date="2026-10-05",image=ui.logo} }
        end
        if name == "streams" then
            stream_video="smoke:2:1"
            stream_provider=nil
            stream_choices={ {id="0",label="1080p WEB-DL H.265 AAC 5.1\n"..string.rep("Release filename and full quality details, English audio, 2.4 GB, 120 seeders\n",18),providerId="torrentio",providerLabel="Torrentio"},
                {id="1",label="720p",providerId="torrentio",providerLabel="Torrentio"},
                {id="2",label="1080p",providerId="yastream",providerLabel="Yastream"} }
        end
        render()
    end)
    mp.register_script_message("rainflix-smoke-provider",function(provider)
        stream_provider=provider ~= "back" and provider or nil
        stream_page=0
        render()
    end)
    mp.register_script_message("rainflix-smoke-long-series",function()
        ui.episodes={}
        for index=1,1001 do ui.episodes[#ui.episodes+1]={id="smoke:1:"..index,season=1,episode=index,title="Earlier episode"} end
        for index=1,2 do ui.episodes[#ui.episodes+1]={id="smoke:23:"..index,season=23,episode=index,title="Late season episode",image=ui.logo} end
        ui.seasons={1,23}; ui.currentVideoId="smoke:23:1"
        ui.title="RainFlix - S23 E1: Late season premiere"
        season=23; episode_page=0; panel="episodes"
        render()
    end)
    mp.register_script_message("rainflix-smoke-current-episode",function(id)
        ui.currentVideoId=id
        render()
    end)
    mp.register_script_message("rainflix-smoke-buffer",function(active,percent)
        if active == "clear" then smoke_buffer=nil
        else smoke_buffer={ active=active == "yes",percent=clamp(tonumber(percent) or 0,0,100) } end
        render()
    end)
    mp.register_script_message("rainflix-smoke-startup",function(active)
        has_played=active ~= "yes"
        render()
    end)
end
mp.add_periodic_timer(1/30, render)
mp.add_periodic_timer(0.25,function()
    if os.getenv("RAINFLIX_NATIVE_SMOKE_MEDIA") then return end
    local updated = read_ui()
    if updated.title then
        ui.episodes=updated.episodes; ui.seasons=updated.seasons
        ui.episodeStatus=updated.episodeStatus
        ui.logo=updated.logo; ui.backdrop=updated.backdrop
        ui.addonSubtitles=updated.addonSubtitles; ui.loadedAddonSubtitles=updated.loadedAddonSubtitles
        ui.subtitleStatus=updated.subtitleStatus; ui.subtitleLookupFailed=updated.subtitleLookupFailed
        if panel=="streams" and updated.streamChoices and updated.streamChoices.videoId==stream_video
            and updated.streamChoices.requestId==tostring(stream_request) then
            stream_choices=updated.streamChoices.items
        end
    end
end)
render()
