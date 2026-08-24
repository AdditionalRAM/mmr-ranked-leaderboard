export interface PlayerData {
    discordUsername: string;
    minecraftUsername: string;
    country: string;
    elo: number;
    pb: number;
    average: number;
}

interface CacheEntry {
    data: PlayerData[];
    timestamp: number;
}

declare global {
    var __leaderboardCache: CacheEntry | null; // typescript complains if we dont do this
}

globalThis.__leaderboardCache = globalThis.__leaderboardCache || null;

const GOOGLE_SHEETS_CSV_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vSfGTeU4wvsxSS-TRNMRoIDrRMTTA09MJX8DakMkoe0iPAAxa5CjsPtRabFftTgewd5xjLiKqjd6ECC/pub?output=csv"
const CACHE_TTL = 60 * 1000; // 60 seconds in ms


async function getPlayersFromSheets(): Promise<{ discordName: string; uuid: string }[]> {
    // SHEETS STRUCTURE:
    // {discord_name},{uui},{device(optional)}
    const res = await fetch(GOOGLE_SHEETS_CSV_URL);
    if (!res.ok) throw new Error("Failed to fetch Google Sheet");

    const csvText = await res.text();

    const rows = csvText.split("\n").slice(1);

    return rows
        .map(row => {
            const [discordName, uuid] = row.split(",").map(cell => cell.trim());
            return { discordName, uuid };
        })
        .filter(player => player.uuid);
}

export async function getLeaderboardData(): Promise<PlayerData[]> {
    const now = Date.now();
    const cache = globalThis.__leaderboardCache;

    if(cache && (now - cache.timestamp < CACHE_TTL)){ // cache exists and is fresh enough (less old than CACHE_TTL)
        console.log(`Returning cache data that is ${(now - cache.timestamp) / 1000} seconds old`)
        return cache.data;
    }

    try {
        const players = await getPlayersFromSheets();
        console.log(`Received ${players.length} players from Sheets CSV`);

        const fullLeaderboard = await Promise.all(
            players.map(async (player) => {
                try {
                    const mcsrRes = await fetch(`https://api.mcsrranked.com/users/${player.uuid}`);
                    if (!mcsrRes.ok) throw new Error();
                    const mcsrJson = await mcsrRes.json();

                    return {
                        discordUsername: player.discordName,
                        minecraftUsername: mcsrJson.data.nickname,
                        elo: mcsrJson.data.eloRate,
                        pb: mcsrJson.data.statistics.total.bestTime.ranked,
                        average: mcsrJson.data.statistics.season.completionTime.ranked / mcsrJson.data.statistics.season.completions.ranked,
                        country: mcsrJson.data.country
                    };
                } catch {
                    // fallback data
                    return {
                        discordUsername: player.discordName,
                        minecraftUsername: "Unknown",
                        average: 0,
                        elo: 0,
                        pb: 0,
                        country: "",
                    };
                }
            })
        );

        // save to cache after fetching
        globalThis.__leaderboardCache = {
            data: fullLeaderboard,
            timestamp: now
        }


        return fullLeaderboard;
    } catch (err) {
        console.error("Error generating leaderboard:", err);
        if(cache) return cache.data; // fallback to potentially stale cache
        return [{
            discordUsername: "unknown",
            minecraftUsername: "Unknown",
            average: 0,
            elo: 0,
            pb: 0,
            country: "",
        }];
    }
}

export { };