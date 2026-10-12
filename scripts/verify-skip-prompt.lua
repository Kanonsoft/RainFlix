local function check(expected)
    local state = mp.get_property_native("user-data/rainflix") or {}
    if state.skipPromptVisible ~= expected then
        mp.msg.error("Skip prompt visibility mismatch: " .. tostring(state.skipPromptVisible))
        mp.msg.error("Buffering=" .. tostring(state.buffering) .. ", chapter=" .. tostring(state.skip and state.skip.title) .. ", time=" .. tostring(mp.get_property_number("time-pos")))
        mp.commandv("quit", "1")
        return false
    end
    return true
end
mp.register_event("file-loaded", function()
    mp.set_property_native("chapter-list", { {time=0,title="Opening"} })
    mp.add_timeout(2, function()
        if not check(false) then return end
        mp.set_property_native("chapter-list", { {time=0,title="Opening"}, {time=.5,title="Story"} })
        mp.commandv("script-message", "rainflix-smoke-reveal")
    end)
    mp.add_timeout(3, function() check(true) end)
    mp.add_timeout(6.5, function()
        if not check(false) then return end
        mp.commandv("script-message", "rainflix-smoke-reveal")
        mp.add_timeout(.2, function() check(true) end)
        mp.add_timeout(4.3, function()
            if check(false) then mp.msg.info("Skip prompt hide/reveal passed"); mp.commandv("quit", "0") end
        end)
    end)
end)
