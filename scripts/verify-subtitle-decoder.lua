-- Run with the generated compressed-subtitles.mks regression fixture.
local expected = { ["First line"]=true, ["Second line"]=true, ["Third line"]=true }
local seen = {}
mp.observe_property("sub-text", "string", function(_, value)
    if expected[value] and not seen[value] then
        seen[value] = true
        mp.msg.info("Decoded: " .. value)
    end
end)
mp.register_event("end-file", function()
    for line in pairs(expected) do
        if not seen[line] then
            mp.msg.error("Missing regression subtitle: " .. line)
            mp.commandv("quit", "1")
            return
        end
    end
    mp.msg.info("All compressed subtitle lines decoded")
    mp.commandv("quit", "0")
end)
