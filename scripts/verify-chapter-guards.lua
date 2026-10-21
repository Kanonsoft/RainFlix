local directory = mp.get_script_directory() or require("mp.utils").split_path(debug.getinfo(1, "S").source:gsub("^@", ""))
local path = directory .. "/../src-tauri/player/rainflix_ui.lua"
assert(loadfile(path))
local file = assert(io.open(path, "rb"))
local source = file:read("*a")
file:close()
local body = assert(source:match("(local function chapter_segment.-)\nlocal function skip_chapter"))
local segment = assert((loadstring or load)(body .. "\nreturn chapter_segment"))()
local cases = {
    {"Opening", 0, 90, true}, {"OP2", 60, 150, true},
    {"Ending", 1320, 1440, true}, {"End Credits", 1320, 1440, true},
    {"Opening", 0, 1440, false}, {"Intro", 0, 240, false},
    {"Opening", 240, 420, false}, {"Opening", 800, 890, false},
    {"Ending", 0, 90, false}, {"Recap", 0, 90, false},
    {"Opening / Recap", 0, 90, false}, {"Opening scene", 0, 90, false},
    {"Previously - OP", 0, 90, false}, {"ED / Next episode preview", 1320, 1440, false},
    {"End of recap", 0, 90, false}, {"Credits - Story", 1320, 1440, false},
    {"OP + ED", 0, 90, false}, {"Part A", 0, 90, false},
}
for _, case in ipairs(cases) do
    local chapters = {{title=case[1],time=case[2]}, {title="Story",time=case[3]}}
    local result = segment(chapters, 1, 1440)
    if (result ~= nil) ~= case[4] then
        mp.msg.error("Unexpected skip/marker classification: " .. case[1])
        mp.commandv("quit", "1")
        return
    end
    if result then assert(result.start == case[2] and result.time == case[3]) end
end
mp.msg.info("Desktop chapter skip/marker guards passed: " .. #cases .. " cases")
mp.commandv("quit", "0")
