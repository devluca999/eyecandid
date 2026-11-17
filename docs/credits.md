# Stock footage credits

The landing page (apps/web/app/page.tsx) uses demo edits made from stock footage from [Mixkit](https://mixkit.co). `scripts/media/build.sh` trims the clips into short loops, re-encodes them and saves them to `apps/web/public/media/`, so the site never loads anything from mixkit.co. The public page is `/credits`.

**Licence:** every clip is under the **Mixkit Stock Video Free License** ([mixkit.co/license](https://mixkit.co/license/#videoFree)). The license allows commercial projects and online marketing, and attribution is not required. Each clip's own page was checked on 17 Nov 2026 and states "Free" (its `copyrightNotice`).

**Each clip appears once on the whole page**, desktop and phone, including blurred and background tiles. `SLOT` in `apps/web/app/_landing/clips.ts` places every clip, and `apps/web/lib/clips.test.ts` fails on a repeat.

**How this differs from the design:**
- **Licence swaps.** The design used 5565, 9582 and 46653. Their pages state the Mixkit Restricted License, which allows personal projects only and lists commercial projects and advertising as not allowed. They were replaced with 41550, 2168 and 4851.
- **New clips instead of repeats.** The design reused clips across sections, so ten more Free clips fill those slots: 42316, 42306, 41290, 49647, 41281, 50422, 42319, 609, 34487 and 42310.
- **Dropped slots.** These had no distinct clip to fill them:
  - the genre switcher's picture-in-picture circle (it repeated the speaker)
  - the genre switcher's cyclist inset
  - the drifting tiles beside the founder letter, the FAQ and the final drop zone

| Mixkit id | Title | Page | Used in |
|---|---|---|---|
| 41550 | Aerial tour of a large meadow covered with vegetation | [mixkit.co](https://mixkit.co/free-stock-video/aerial-tour-of-a-large-meadow-covered-with-vegetation-41550/) | hero (far, blurred circle) |
| 42316 | Girl recording a video on a background of cereal boxes | [mixkit.co](https://mixkit.co/free-stock-video/girl-recording-a-video-on-a-background-of-cereal-boxes-42316/) | hero (blurred card) |
| 42306 | Happy woman dancing happily in a colorful spot | [mixkit.co](https://mixkit.co/free-stock-video/happy-woman-dancing-happily-in-a-colorful-spot-42306/) | hero (blurred tile) |
| 32800 | Young woman getting into position for sprinting | [mixkit.co](https://mixkit.co/free-stock-video/young-woman-getting-into-position-for-sprinting-32800/) | hero (runner) |
| 2168 | Bright orange sunset on beach | [mixkit.co](https://mixkit.co/free-stock-video/bright-orange-sunset-on-beach-2168/) | hero |
| 2300 | Woman opens a box | [mixkit.co](https://mixkit.co/free-stock-video/woman-opens-a-box-2300/) | hero (b-roll tile, unboxing; replaced the coffee pour, since the hero already has a drink) |
| 40865 | A person riding a bicycle to the side of a cycling track | [mixkit.co](https://mixkit.co/free-stock-video/a-person-riding-a-bicycle-to-the-side-of-a-40865/) | hero (cyclist) |
| 41290 | Face of a vlogger speaking to the camera | [mixkit.co](https://mixkit.co/free-stock-video/face-of-a-vlogger-speaking-to-the-camera-41290/) | hero (small circle) |
| 810 | Latte art | [mixkit.co](https://mixkit.co/free-stock-video/latte-art-810/) | hero (small tile) |
| 49647 | A young smiling woman filming a video by the lake | [mixkit.co](https://mixkit.co/free-stock-video/a-young-smiling-woman-filming-a-video-by-the-lake-49647/) | hero (circle) |
| 41272 | Youtuber vlogging in his studio | [mixkit.co](https://mixkit.co/free-stock-video/youtuber-vlogging-in-his-studio-41272/) | reel |
| 42308 | Cheerful girl recording herself with a colorful background | [mixkit.co](https://mixkit.co/free-stock-video/cheerful-girl-recording-herself-with-a-colorful-background-42308/) | reel |
| 41181 | Woman taking a selfie in the morning | [mixkit.co](https://mixkit.co/free-stock-video/woman-taking-a-selfie-in-the-morning-41181/) | reel |
| 41281 | Placing a camera on a tripod | [mixkit.co](https://mixkit.co/free-stock-video/placing-a-camera-on-a-tripod-41281/) | reel (b-roll tile) |
| 42323 | Portrait of an influencer talking to the camera | [mixkit.co](https://mixkit.co/free-stock-video/portrait-of-an-influencer-talking-to-the-camera-42323/) | cringe to cinema |
| 50422 | A young woman using skincare cream product on her face | [mixkit.co](https://mixkit.co/free-stock-video/a-young-woman-using-skincare-cream-product-on-her-face-50422/) | cringe to cinema (b-roll) |
| 42319 | Happy girl posing in front of the camera | [mixkit.co](https://mixkit.co/free-stock-video/happy-girl-posing-in-front-of-the-camera-42319/) | genre switcher |
| 609 | Runner on a track in slow motion | [mixkit.co](https://mixkit.co/free-stock-video/runner-on-a-track-in-slow-motion-609/) | genre switcher (sports ad) |
| 34487 | Blogging girl down the street with his cell | [mixkit.co](https://mixkit.co/free-stock-video/blogging-girl-down-the-street-with-his-cell-34487/) | autopilots |
| 42310 | Girl promoting social media apps | [mixkit.co](https://mixkit.co/free-stock-video/girl-promoting-social-media-apps-42310/) | real or ai ("real") |
| 4851 | Girl running during sunset ties her shoelaces | [mixkit.co](https://mixkit.co/free-stock-video/girl-running-during-sunset-ties-her-shoelaces-4851/) | real or ai ("ai": a stock clip standing in for AI footage) |
| 583 | Woman doing warm up exercises | [mixkit.co](https://mixkit.co/free-stock-video/woman-doing-warm-up-exercises-583/) | pricing |

**To change the list:** edit `scripts/media/clips.tsv` and `SLOT`, then run `scripts/media/build.sh`. The script needs curl and ffmpeg, and puts raw downloads in the git-ignored `scripts/media/.raw/`. Check the licence on each new clip's page first. The committed media stays under about 30 MB; it is 28 MB now.
