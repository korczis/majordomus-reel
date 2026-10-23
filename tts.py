"""Voice one line with the free Edge neural TTS and keep each word's timing for captions."""
import asyncio
import json
import sys

import edge_tts


async def main(text, voice, rate, mp3_path, words_path):
    communicate = edge_tts.Communicate(text, voice, rate=rate, boundary="WordBoundary")
    words = []
    with open(mp3_path, "wb") as audio:
        async for chunk in communicate.stream():
            if chunk["type"] == "audio":
                audio.write(chunk["data"])
            elif chunk["type"] == "WordBoundary":
                start = chunk["offset"] / 1e7
                words.append({
                    "text": chunk["text"],
                    "start": start,
                    "end": start + chunk["duration"] / 1e7,
                })
    with open(words_path, "w") as out:
        json.dump(words, out)


if __name__ == "__main__":
    asyncio.run(main(*sys.argv[1:6]))
