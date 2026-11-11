package com.madaratn.novelreader;

import static org.junit.Assert.assertEquals;

import java.util.Arrays;
import java.util.List;
import org.json.JSONArray;
import org.json.JSONObject;
import org.junit.Test;

// Background check of new episodes: which titles are announced, and only once.
public class EpisodeCheckTest {
    @Test
    public void countsBothAnswerShapes() throws Exception {
        assertEquals(2, EpisodeCheckWorker.count("[{\"url\":\"a\"},{\"url\":\"b\"}]"));
        assertEquals(3, EpisodeCheckWorker.count(" {\"episodes\":[1,2,3]} "));
        assertEquals(0, EpisodeCheckWorker.count("{}"));
    }

    @Test
    public void announcesATitleOnceWhenItHasMoreEpisodes() throws Exception {
        JSONArray items = new JSONArray("[{\"name\":\"Lanterns\",\"sourceId\":\"42\",\"url\":\"/s/1\",\"episodes\":10},"
            + "{\"name\":\"Same\",\"sourceId\":\"42\",\"url\":\"/s/2\",\"episodes\":5},"
            + "{\"name\":\"New in library\",\"sourceId\":\"7\",\"url\":\"/s/3\",\"episodes\":0},"
            + "{\"name\":\"Source down\",\"sourceId\":\"9\",\"url\":\"/s/4\",\"episodes\":3}]");
        JSONObject seen = new JSONObject();
        java.util.function.Function<JSONObject, Integer> now = it -> {
            switch (it.optString("url")) { case "/s/1": return 12; case "/s/2": return 5; case "/s/3": return 8; default: return null; }
        };
        List<String> first = EpisodeCheckWorker.compare(items, seen, now);
        assertEquals(Arrays.asList("Lanterns"), first);
        assertEquals(12, seen.getInt("42|/s/1"));
        // Same answer six hours later: nothing new to say.
        assertEquals(0, EpisodeCheckWorker.compare(items, seen, now).size());
        // One more episode later on: announced again, including the title first seen with 8.
        List<String> later = EpisodeCheckWorker.compare(items, seen, it -> it.optString("url").equals("/s/3") ? 9 : now.apply(it));
        assertEquals(Arrays.asList("New in library"), later);
    }
}
