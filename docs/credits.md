# Stock footage credits

The landing page (apps/web/app/page.tsx) uses demo edits made from stock footage from [Mixkit](https://mixkit.co). `scripts/media/build.sh` trims the clips into short loops, re-encodes them and saves them to `apps/web/public/media/`, so the site never loads anything from mixkit.co. The public page is `/credits`.

**Licence:** every clip is under the **Mixkit Stock Video Free License** ([mixkit.co/license](https://mixkit.co/license/#videoFree)). The license allows commercial projects and online marketing, and attribution is not required. Each clip's own page was checked on 17 Nov 2026 and states "Free" (its `copyrightNotice`).

**Three clips differ from the design.** The design used 5565 (countryside meadow), 9582 (sunbeams at sunset) and 46653 (runner under a city bridge). Their pages state the **Mixkit Stock Video Restricted License**, which allows personal projects only and lists commercial projects and advertising as not allowed. They were replaced with Free-license clips of the same kind:

- 5565 → 41550
- 9582 → 2168
- 46653 → 4851

| Mixkit id | Title | Page | Used in |
|---|---|---|---|
| 41550 | Aerial tour of a large meadow covered with vegetation | [mixkit.co](https://mixkit.co/free-stock-video/aerial-tour-of-a-large-meadow-covered-with-vegetation-41550/) | hero (far circle), founder letter |
| 41272 | Youtuber vlogging in his studio | [mixkit.co](https://mixkit.co/free-stock-video/youtuber-vlogging-in-his-studio-41272/) | hero, reel, autopilots |
| 42308 | Cheerful girl recording herself with a colorful background | [mixkit.co](https://mixkit.co/free-stock-video/cheerful-girl-recording-herself-with-a-colorful-background-42308/) | hero, reel, real or ai |
| 32800 | Young woman getting into position for sprinting | [mixkit.co](https://mixkit.co/free-stock-video/young-woman-getting-into-position-for-sprinting-32800/) | hero (runner), genre switcher, final drop |
| 2168 | Bright orange sunset on beach | [mixkit.co](https://mixkit.co/free-stock-video/bright-orange-sunset-on-beach-2168/) | hero |
| 236 | Filling a white cup of coffee | [mixkit.co](https://mixkit.co/free-stock-video/filling-a-white-cup-of-coffee-236/) | hero, cringe to cinema (b-roll), final drop |
| 40865 | A person riding a bicycle to the side of a cycling track | [mixkit.co](https://mixkit.co/free-stock-video/a-person-riding-a-bicycle-to-the-side-of-a-40865/) | hero, genre switcher |
| 42323 | Portrait of an influencer talking to the camera | [mixkit.co](https://mixkit.co/free-stock-video/portrait-of-an-influencer-talking-to-the-camera-42323/) | hero, cringe to cinema, genre switcher |
| 810 | Latte art | [mixkit.co](https://mixkit.co/free-stock-video/latte-art-810/) | hero, reel, founder letter |
| 41181 | Woman taking a selfie in the morning | [mixkit.co](https://mixkit.co/free-stock-video/woman-taking-a-selfie-in-the-morning-41181/) | hero, reel, faq |
| 4851 | Girl running during sunset ties her shoelaces | [mixkit.co](https://mixkit.co/free-stock-video/girl-running-during-sunset-ties-her-shoelaces-4851/) | real or ai (the "ai" tile: a stock clip standing in for AI footage) |
| 583 | Woman doing warm up exercises | [mixkit.co](https://mixkit.co/free-stock-video/woman-doing-warm-up-exercises-583/) | pricing |

**To change the list:** edit `scripts/media/clips.tsv`, then run `scripts/media/build.sh`. The script needs curl and ffmpeg, and puts raw downloads in the git-ignored `scripts/media/.raw/`. Check the licence on each new clip's page first.
