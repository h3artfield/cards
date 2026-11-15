/**
 * The Token Creator's art styles.
 *
 * Every style is a creative preset, not a model: the same image model draws all
 * of them, steered by `direction`. Each direction describes medium, line, colour,
 * light and texture, because a bare style name gives the model too little to
 * work from and two neighbouring names come out looking alike.
 *
 * Named shows and eras describe a look in general terms only. No direction names
 * a character, a logo or a studio, so the art stays original enough to print.
 *
 * Bump `TOKEN_STYLE_REGISTRY_VERSION` whenever a direction changes, so saved
 * generations record which wording produced them.
 */
export const TOKEN_STYLE_REGISTRY_VERSION = "2026-11-04.1";

export type TokenStyleCategoryIdV1 =
  | "fantasy"
  | "fine_art"
  | "world_traditions"
  | "drawing_painting"
  | "print_craft"
  | "digital_3d"
  | "comics_retro"
  | "tv_cartoons"
  | "anime_comics"
  | "retro_screen"
  | "puppets_miniatures"
  | "photography";

export type TokenStyleV1 = {
  id: string;
  number: number;
  name: string;
  category: TokenStyleCategoryIdV1;
  /** One line for the wheel. */
  blurb: string;
  /** What the image model is told. */
  direction: string;
  /** Extra words search should match. */
  keywords: string[];
};

export const TOKEN_STYLE_CATEGORIES_V1: ReadonlyArray<{
  id: TokenStyleCategoryIdV1;
  label: string;
}> = [
  { id: "fantasy", label: "Realism & Fantasy" },
  { id: "fine_art", label: "Fine Art Movements" },
  { id: "world_traditions", label: "World & Historic Art" },
  { id: "drawing_painting", label: "Paint & Drawing" },
  { id: "print_craft", label: "Print & Collage" },
  { id: "digital_3d", label: "3D, Game & Digital" },
  { id: "comics_retro", label: "Comics & Retro Sci-Fi" },
  { id: "tv_cartoons", label: "TV Cartoons" },
  { id: "anime_comics", label: "Anime & Comics" },
  { id: "retro_screen", label: "Retro TV & Cinema" },
  { id: "puppets_miniatures", label: "Puppets & Miniatures" },
  { id: "photography", label: "Photography & Lenses" },
];

type Row = [
  name: string,
  category: TokenStyleCategoryIdV1,
  blurb: string,
  direction: string,
  keywords?: string[],
];

const ROWS: Row[] = [
  // 1–8: realism and fantasy
  ["Photorealism", "fantasy", "Looks like a real photograph of an impossible subject.",
    "Photorealistic image as if captured by a professional full-frame camera: true-to-life materials, accurate skin, metal and fabric texture, natural depth of field, physically plausible light and shadow, no painterly brushwork.",
    ["realistic", "photo", "real"]],
  ["Cinematic Realism", "fantasy", "A still from a big-budget fantasy film.",
    "Cinematic film still: anamorphic widescreen feel recomposed for portrait, dramatic motivated key light with soft rim light, atmospheric haze and volumetric rays, teal-and-amber colour grade, shallow focus on the subject, production-design level detail.",
    ["movie", "film", "realistic"]],
  ["Dark Fantasy", "fantasy", "Grim, ominous, beautiful and dangerous.",
    "Dark fantasy painting: brooding desaturated palette of ash, rust and deep crimson, heavy chiaroscuro, smoke and embers, weathered armour and worn cloth, ominous mood, richly rendered digital-oil brushwork.",
    ["grim", "horror", "gothic"]],
  ["High Fantasy", "fantasy", "Luminous, epic, classic fantasy art.",
    "High fantasy illustration: luminous saturated colour, sweeping epic landscape behind the subject, ornate costume and magical glow, clear heroic silhouette, polished painterly rendering in the tradition of classic fantasy card art.",
    ["epic", "magic", "classic"]],
  ["Heroic Fantasy", "fantasy", "Muscular, dramatic, pulp-heroic.",
    "Heroic fantasy oil painting: powerful dynamic pose, exaggerated musculature and dramatic foreshortening, fiery sunset or storm-lit sky, thick confident brushstrokes, warm earthy palette with bold highlights.",
    ["barbarian", "pulp", "action"]],
  ["Gothic Horror", "fantasy", "Candlelit cathedrals, moonlight and dread.",
    "Gothic horror illustration: moonlit or candlelit scene, pointed arches, fog, wrought iron and crumbling stone, pale cold blues against deep blacks with sickly highlights, Victorian macabre atmosphere, fine detailed rendering.",
    ["horror", "vampire", "victorian", "spooky"]],
  ["Cosmic Horror", "fantasy", "Vast, unknowable, wrong.",
    "Cosmic horror artwork: overwhelming sense of scale, impossible geometry and writhing forms emerging from void, alien bioluminescent greens and violets against black, tiny figures for scale, unsettling and awe-inspiring.",
    ["horror", "eldritch", "tentacles", "space"]],
  ["Surrealism", "fantasy", "Dream logic rendered with precision.",
    "Surrealist painting: dreamlike impossible juxtapositions, melting or floating objects, long hard shadows on an endless plain, smooth meticulous oil technique, clear still light, quietly uncanny atmosphere.",
    ["dream", "weird"]],

  // 9–18: fine art movements
  ["Art Nouveau", "fine_art", "Flowing lines, halos and ornament.",
    "Art Nouveau poster illustration: elegant flowing whiplash lines, decorative circular halo behind the figure, stylised floral ornament, flat muted gold, sage and rose palette, clean contour outlines.",
    ["mucha", "poster", "ornate", "decorative"]],
  ["Art Deco", "fine_art", "Geometric glamour and gold.",
    "Art Deco illustration: bold symmetrical geometry, sunburst and stepped motifs, streamlined forms, black, cream and metallic gold palette with jewel-tone accents, crisp graphic poster finish.",
    ["1920s", "geometric", "gold", "gatsby"]],
  ["Renaissance Oil Painting", "fine_art", "Old-master realism and calm grandeur.",
    "Italian Renaissance oil painting: balanced classical composition, sfumato soft modelling, warm umber and ultramarine palette, idealised anatomy, distant atmospheric landscape, fine craquelure on aged varnish.",
    ["old master", "classical", "oil"]],
  ["Baroque Oil Painting", "fine_art", "Theatrical darkness and blazing light.",
    "Baroque oil painting: intense tenebrism with figures emerging from deep black, single dramatic light source, rich crimson and gold drapery, dynamic diagonal composition, emotional theatrical gesture.",
    ["caravaggio", "dramatic", "oil"]],
  ["Dutch Golden Age Painting", "fine_art", "Quiet window light and rich detail.",
    "Dutch Golden Age painting: soft north-window daylight, meticulous detail of textiles, metal and glass, muted earthy palette, intimate domestic or still-life staging, smooth glazed oil surface.",
    ["vermeer", "rembrandt", "still life"]],
  ["Romanticism", "fine_art", "Sublime nature, storms and awe.",
    "Romantic-era painting: sublime dramatic landscape, stormy skies and crashing elements, small figure against vast nature, emotional golden and slate palette, loose energetic brushwork in the sky.",
    ["sublime", "landscape", "storm"]],
  ["Impressionism", "fine_art", "Broken colour and shimmering light.",
    "Impressionist painting: visible short broken brushstrokes, vibrant complementary colour, shimmering outdoor light, soft edges, everyday moment captured quickly, no hard outlines.",
    ["monet", "brushstrokes", "light"]],
  ["Post-Impressionism", "fine_art", "Swirling strokes and bold colour.",
    "Post-Impressionist painting: thick swirling impasto strokes, bold expressive colour, simplified forms with dark contour lines, rhythmic patterned sky, emotional intensity.",
    ["van gogh", "swirl", "impasto"]],
  ["Expressionism", "fine_art", "Raw emotion and distorted form.",
    "Expressionist painting: distorted angular forms, raw aggressive brushwork, clashing acidic colours, emotional psychological intensity, flattened perspective and heavy dark outlines.",
    ["munch", "emotional", "distorted"]],
  ["Symbolism", "fine_art", "Mythic, mysterious, dreamlike allegory.",
    "Symbolist painting: mysterious allegorical mood, pale mythic figures, decorative gold detailing, twilight jewel tones, soft hazy glow, quiet ritual stillness and hidden meaning.",
    ["klimt", "myth", "allegory"]],

  // 19–26: world and historic traditions
  ["Ukiyo-e Woodblock", "world_traditions", "Japanese woodblock with flat colour.",
    "Ukiyo-e woodblock print: bold flowing black key lines, flat areas of indigo, vermilion and pale ochre, stylised waves, clouds and wind, visible paper grain and gentle colour registration offsets.",
    ["japanese", "woodblock", "hokusai", "print"]],
  ["Sumi-e Ink Wash", "world_traditions", "Expressive black ink on rice paper.",
    "Sumi-e ink wash painting: confident single brush strokes in graded black ink, generous empty space, wet bleeding edges on rice paper, minimal accents of red seal colour, meditative restraint.",
    ["japanese", "ink", "brush", "zen"]],
  ["Chinese Brush Painting", "world_traditions", "Misty mountains and fine brushwork.",
    "Traditional Chinese brush painting: layered misty mountains, delicate ink line and soft mineral blue-green washes, silk scroll texture, calligraphic brush rhythm, poetic spacious composition.",
    ["chinese", "ink", "scroll", "mountains"]],
  ["Medieval Illuminated Manuscript", "world_traditions", "Gold leaf, vellum and marginalia.",
    "Medieval illuminated manuscript page illustration: flat stylised figures, gold leaf backgrounds, lapis blue and vermilion pigment, decorative vine borders, aged vellum texture. Picture only, no lettering or words.",
    ["medieval", "gold leaf", "manuscript"]],
  ["Byzantine Mosaic", "world_traditions", "Glittering tesserae and gold.",
    "Byzantine mosaic: image built from small square glass and stone tesserae with visible grout lines, shimmering gold background, frontal solemn figures, deep blues and reds, light catching individual tiles.",
    ["mosaic", "tiles", "gold"]],
  ["Stained Glass", "world_traditions", "Leaded glass glowing with light.",
    "Stained glass window: jewel-coloured translucent glass panes separated by thick dark lead lines, light glowing through from behind, painted facial details, gothic tracery shapes, rich ruby, sapphire and emerald.",
    ["church", "glass", "window", "gothic"]],
  ["Fresco", "world_traditions", "Chalky wall painting with age.",
    "Fresco wall painting: matte chalky pigments absorbed into plaster, soft earthy palette of ochre, terracotta and faded blue, gentle cracks and patches of loss, calm monumental figures.",
    ["wall", "plaster", "ancient"]],
  ["Tempera Painting", "world_traditions", "Fine hatching and luminous egg tempera.",
    "Egg tempera panel painting: fine cross-hatched brushwork, luminous opaque colour, crisp edges, gold-leaf accents, slightly flat early-Renaissance perspective, smooth gessoed wood panel surface.",
    ["tempera", "panel", "icon"]],

  // 27–33: painting and drawing media
  ["Watercolor", "drawing_painting", "Transparent washes and blooms.",
    "Watercolour painting: transparent layered washes, soft blooms and granulation, white paper showing through for highlights, loose wet-in-wet edges, light airy palette with a few crisp details.",
    ["watercolour", "wash", "soft"]],
  ["Gouache", "drawing_painting", "Opaque, matte, storybook colour.",
    "Gouache painting: opaque matte colour with flat graphic shapes, slight brush texture, rich saturated mid-century storybook palette, clean edges and simple confident shading.",
    ["storybook", "matte", "illustration"]],
  ["Pastel Drawing", "drawing_painting", "Soft powdery colour on toned paper.",
    "Soft pastel drawing: powdery blended colour, visible chalky strokes on toned paper, glowing soft light, gentle edges, toothy paper texture showing through.",
    ["chalk", "soft"]],
  ["Charcoal Sketch", "drawing_painting", "Smudged blacks and bold gesture.",
    "Charcoal drawing: bold gestural strokes, rich smudged blacks and erased highlights, rough paper texture, dramatic tonal contrast, monochrome with expressive energy.",
    ["sketch", "black and white", "drawing"]],
  ["Graphite Sketch", "drawing_painting", "Precise pencil rendering.",
    "Graphite pencil drawing: precise fine linework and smooth tonal shading, subtle silver sheen, visible construction lines at the edges, monochrome on clean white sketchbook paper.",
    ["pencil", "sketch", "drawing"]],
  ["Ink Crosshatching", "drawing_painting", "Pen-and-ink textures and hatching.",
    "Pen and ink illustration: dense crosshatching and stippling to build tone, crisp black lines on white, intricate texture detail, old book-illustration feel, no grey wash.",
    ["pen", "ink", "hatching", "black and white"]],
  ["Etching and Engraving", "drawing_painting", "Copperplate lines and fine detail.",
    "Copperplate etching and engraving: fine parallel and curved engraved lines, swelling line weight to model form, sepia or black ink on cream paper, plate-mark border feel, antique scientific-plate precision.",
    ["engraving", "antique", "print"]],

  // 34–38: print and collage
  ["Linocut", "print_craft", "Carved blocks and bold shapes.",
    "Linocut print: bold carved shapes with chunky gouged texture, limited two or three colour palette, strong black and white contrast, slightly uneven ink coverage on paper.",
    ["block print", "carved", "print"]],
  ["Screen Print", "print_craft", "Flat poster colour with offsets.",
    "Screen print poster: flat layered spot colours, slight misregistration between layers, halftone gradients, bold graphic simplification, limited vivid palette.",
    ["poster", "silkscreen", "print"]],
  ["Risograph", "print_craft", "Grainy duotone zine printing.",
    "Risograph print: grainy duotone or tritone inks like fluorescent pink, teal and yellow overlapping, visible grain and slight misregistration, indie zine character, flat simplified shapes.",
    ["riso", "zine", "duotone", "print"]],
  ["Paper-Cut Collage", "print_craft", "Layered cut paper with shadows.",
    "Layered paper-cut art: shapes cut from coloured card stock, stacked in depth with soft drop shadows between layers, crisp cut edges, subtle paper fibre texture, diorama-like dimensionality.",
    ["paper", "papercraft", "layered"]],
  ["Mixed-Media Collage", "print_craft", "Torn paper, paint and found images.",
    "Mixed-media collage: torn magazine and vintage paper fragments, paint splashes, tape and stitching, layered textures and handwritten-mark shapes without legible words, energetic handmade composition.",
    ["collage", "scrapbook", "texture"]],

  // 39–44: 3D, game and digital
  ["Claymation", "digital_3d", "Plasticine characters with fingerprints.",
    "Claymation still: characters sculpted from plasticine with visible fingerprints and tool marks, slightly lumpy handmade surfaces, saturated colours, miniature set with practical lighting.",
    ["clay", "plasticine", "stop motion"]],
  ["Stop-Motion Miniature", "digital_3d", "Handmade puppets on a tiny set.",
    "Stop-motion animation still: handcrafted armature puppet with fabric and resin details, miniature hand-built set, warm practical lights, slightly imperfect textures, shallow macro depth of field.",
    ["stop motion", "puppet", "miniature"]],
  ["Low-Poly 3D", "digital_3d", "Faceted geometry and flat shading.",
    "Low-poly 3D render: faceted geometric surfaces with flat-shaded triangles, simple gradient sky, clean pastel or jewel palette, minimal stylised forms, soft ambient occlusion.",
    ["polygon", "geometric", "3d"]],
  ["High-Detail 3D Render", "digital_3d", "Ray-traced, sculpted, ultra-detailed.",
    "High-detail 3D render: digitally sculpted forms with micro surface detail, physically based materials, ray-traced global illumination and reflections, cinematic lighting, crisp subsurface scattering.",
    ["3d", "cgi", "render"]],
  ["Pixel Art", "digital_3d", "Chunky retro game pixels.",
    "Pixel art: visible square pixels on a coarse grid, limited 32-colour palette, dithering for shading, crisp edges with no anti-aliasing, 16-bit era game sprite and background feel.",
    ["8-bit", "16-bit", "retro", "game"]],
  ["Isometric Game Art", "digital_3d", "Tiny isometric diorama world.",
    "Isometric game art: 30-degree isometric view of a compact diorama scene, clean stylised modelling, bright readable colours, soft shadows, strategy-game tile composition.",
    ["game", "isometric", "diorama"]],

  // 45–50: comics and retro
  ["Comic-Book Inks", "comics_retro", "Bold inks and dramatic panels.",
    "Modern comic-book art: bold confident ink lines with spot blacks, dynamic foreshortened action, cel-shaded digital colour with strong highlights, dramatic speed and impact.",
    ["comic", "superhero", "ink"]],
  ["Retro Pulp Illustration", "comics_retro", "Painted pulp-magazine cover drama.",
    "Retro pulp magazine cover painting: lurid saturated colours, melodramatic pose, painted gouache and oil technique, aged paper tone, sensational adventure atmosphere. Picture only, no title lettering.",
    ["pulp", "vintage", "1930s", "adventure"]],
  ["Vintage Science Fiction", "comics_retro", "Chrome rockets and retro futures.",
    "Vintage 1960s–70s science fiction paperback art: airbrushed chrome and gradients, gleaming retro-futuristic machines, vast alien vistas, warm orange and teal palette, optimistic space-age wonder.",
    ["sci-fi", "space", "retro", "rocket"]],
  ["Cyberpunk Neon", "comics_retro", "Rain, neon and chrome.",
    "Cyberpunk scene: rain-slick night streets, glowing magenta and cyan neon, holographic haze, chrome cybernetics, dense layered city, high-contrast reflections and volumetric light.",
    ["neon", "future", "sci-fi", "city"]],
  ["Steampunk Illustration", "comics_retro", "Brass gears and Victorian invention.",
    "Steampunk illustration: brass and copper machinery, gears, rivets and pressure gauges, Victorian clothing, warm sepia and amber light with drifting steam, intricate mechanical detail.",
    ["victorian", "gears", "brass"]],
  ["Minimalist Vector Art", "comics_retro", "Clean flat shapes, few colours.",
    "Minimalist vector illustration: clean geometric flat shapes, limited harmonious palette of three or four colours, negative space, no texture or outlines, crisp modern graphic design.",
    ["flat", "vector", "simple", "modern"]],

  // 51–60: television cartoons
  ["Family Guy–Style Cartoon", "tv_cartoons", "Adult-sitcom cartoon with bold outlines.",
    "Adult prime-time sitcom cartoon look: bold uniform black outlines, flat colours with no gradients, rounded simple character shapes with large oval eyes, plain suburban backgrounds, expressive comedic poses. Original characters only.",
    ["cartoon", "sitcom", "adult", "animation"]],
  ["South Park–Style Cutout Cartoon", "tv_cartoons", "Crude construction-paper cutouts.",
    "Crude construction-paper cutout animation look: simple geometric characters built from flat circles and ovals, no shading, deliberately primitive construction, flat layered backgrounds, small dot eyes. Original characters only.",
    ["cartoon", "cutout", "paper", "crude"]],
  ["1980s Saturday Morning Cartoon", "tv_cartoons", "Hand-painted cels and broadcast warmth.",
    "1980s Saturday-morning cartoon still: hand-painted cel animation, saturated primary colours, painted background plates, slight analogue broadcast warmth and softness, exaggerated heroic expressions.",
    ["cartoon", "1980s", "80s", "retro", "animation"]],
  ["1980s Action Figure Cartoon", "tv_cartoons", "Muscled heroes and toy-commercial gloss.",
    "1980s action-figure cartoon: muscular fantasy heroes and villains in dramatic power poses, airbrushed gradient skies, glowing weapons, vivid toy-commercial colour and gloss. Original characters only.",
    ["cartoon", "1980s", "80s", "action", "toy"]],
  ["1990s Saturday Morning Cartoon", "tv_cartoons", "Bright, thick-lined, full of energy.",
    "1990s Saturday-morning cartoon: thick inked outlines, bright punchy colours, energetic squash-and-stretch poses, expressive faces, clean painted backgrounds.",
    ["cartoon", "1990s", "90s", "animation"]],
  ["1990s Gross-Out Cartoon", "tv_cartoons", "Grotesque close-ups and odd anatomy.",
    "1990s gross-out cartoon: wildly exaggerated anatomy, extreme grotesque detailed close-ups with veins and pores, off-kilter proportions, sickly greens and pinks, comedic absurdity.",
    ["cartoon", "1990s", "90s", "gross", "weird"]],
  ["1990s Angular Cartoon", "tv_cartoons", "Sharp geometry and limited palettes.",
    "1990s angular cartoon design: sharp geometric shapes, triangular and rectangular characters, limited bold palettes, stylised flat faces, strong graphic composition with retro-modern flair.",
    ["cartoon", "1990s", "90s", "geometric"]],
  ["2000s Flash Animation", "tv_cartoons", "Early-internet vector cartoons.",
    "2000s Flash animation: clean digital vector outlines of even weight, simple flat colour fills with one shadow tone, slightly stiff puppet-rigged poses, early-internet cartoon charm.",
    ["cartoon", "2000s", "flash", "vector", "internet"]],
  ["1960s Limited Animation", "tv_cartoons", "Mid-century TV cartoon simplicity.",
    "1960s limited television animation: simplified characters with thick outlines, repetitive patterned painted backgrounds, mid-century modern shapes, muted pastel palette, economical stylish design.",
    ["cartoon", "1960s", "60s", "mid-century"]],
  ["1930s Rubber-Hose Cartoon", "tv_cartoons", "Pie-cut eyes and bendy limbs.",
    "1930s rubber-hose animation: black-and-white characters with pie-cut eyes, white gloves and noodle-like bendy limbs, bouncy poses, vintage film grain, scratches and flicker.",
    ["cartoon", "1930s", "vintage", "black and white"]],

  // 61–70: anime and comics
  ["1980s Anime Cel", "anime_comics", "Hand-inked cels with analogue glow.",
    "1980s anime cel still: hand-inked linework, painted cel shading with two tones, vintage anime lighting with soft bloom, slight film grain and colour fade, detailed painted background.",
    ["anime", "1980s", "80s", "retro"]],
  ["1990s Anime OVA", "anime_comics", "Lavish backgrounds and cinematic framing.",
    "1990s anime OVA: highly detailed hand-painted backgrounds, cinematic framing, expressive faces, atmospheric cel shading with dramatic rim light, rich moody palette.",
    ["anime", "1990s", "90s", "ova"]],
  ["Retro Mecha Anime", "anime_comics", "Hand-drawn giant robots and explosions.",
    "Retro mecha anime: hand-drawn giant robot with panel lines and mechanical detail, dramatic low-angle perspective, beam and explosion effects, missile trails, gritty cel shading.",
    ["anime", "robot", "mecha", "retro"]],
  ["Magical Girl Anime", "anime_comics", "Sparkles, ribbons and pastel light.",
    "Magical girl anime: sparkling transformation light, pastel highlights, flowing ribbons and costume, floating magical particles and stars, elegant graceful pose, soft glow.",
    ["anime", "magic", "sparkle", "pastel"]],
  ["Shonen Battle Anime", "anime_comics", "Speed lines and blazing energy.",
    "Shonen battle anime: explosive energy aura, speed lines, intense determined expression, dynamic extreme camera angle, impact frames and debris, saturated high-contrast colour.",
    ["anime", "action", "battle", "energy"]],
  ["Chibi Anime", "anime_comics", "Big heads, tiny bodies, maximum cute.",
    "Chibi anime: super-deformed character with oversized head and tiny body, huge sparkling eyes, simple rounded shapes, soft pastel shading, adorable playful pose.",
    ["anime", "cute", "chibi", "kawaii"]],
  ["Dark Animated Thriller", "anime_comics", "Shadows and psychological tension.",
    "Dark animated thriller: moody cel-shaded imagery, deep shadows and subdued desaturated colour, tense off-centre composition, unsettling stillness, psychological unease.",
    ["anime", "dark", "thriller", "horror"]],
  ["Sunday Newspaper Comic Strip", "anime_comics", "Classic printed funnies.",
    "Sunday newspaper comic strip panel: hand-inked cartoon characters, simple scenery, playful expressions, flat four-colour newsprint printing with slight offset, warm paper tone. No speech balloons or words.",
    ["comic", "newspaper", "funnies", "strip"]],
  ["Vintage Halftone Comic", "anime_comics", "Coarse dots on aged paper.",
    "Vintage comic book printing: coarse visible halftone dots, limited bold CMYK colours, heavy black inks, aged yellowed newsprint, slight misregistration and ink bleed. No speech balloons or words.",
    ["comic", "halftone", "vintage", "pop art"]],
  ["Underground Comix", "anime_comics", "Psychedelic ink and surreal excess.",
    "Underground comix: dense obsessive ink linework, psychedelic distortion, surreal exaggerated characters, wavy patterned backgrounds, limited acid colour or black and white.",
    ["comic", "psychedelic", "1960s", "1970s", "weird"]],

  // 71–80: retro television and cinema
  ["1980s After-School Special", "retro_screen", "Earnest live-action TV drama.",
    "Still from an earnest 1980s live-action television drama: natural suburban daylight, period clothing and hair, soft standard-definition video texture, slightly washed broadcast colour, sincere staged performance.",
    ["1980s", "80s", "tv", "live action", "drama"]],
  ["1970s Educational Television", "retro_screen", "Public-TV studio warmth.",
    "Still from 1970s educational public television: simple theatrical studio set, warm studio lights, analogue video softness and slight colour bleed, earnest friendly staging.",
    ["1970s", "70s", "tv", "studio", "vintage"]],
  ["1980s VHS Fantasy Movie", "retro_screen", "Practical costumes and soft focus.",
    "Still from a 1980s fantasy movie on VHS: practical costumes and rubber effects, painted matte backdrops, soft-focus diffusion and star filters, film grain and nostalgic tape colour grading.",
    ["1980s", "80s", "vhs", "movie", "fantasy"]],
  ["1990s Direct-to-Video Creature Feature", "retro_screen", "Low-budget monsters and coloured smoke.",
    "Still from a 1990s direct-to-video creature feature: low-budget practical monster suit, latex makeup, coloured smoke and gel lighting, slightly cheap video-store horror energy.",
    ["1990s", "90s", "monster", "horror", "b-movie"]],
  ["1950s Science Fiction B-Movie", "retro_screen", "Black-and-white flying-saucer era.",
    "Still from a 1950s science fiction B-movie: black-and-white film, hard dramatic studio lighting, retro alien and robot costumes, miniature spaceships, painted backdrops, vintage film grain.",
    ["1950s", "50s", "sci-fi", "black and white", "b-movie"]],
  ["1960s Technicolor Adventure", "retro_screen", "Saturated film colour and painted skies.",
    "Still from a 1960s Technicolor adventure film: rich saturated three-strip colour, theatrical costumes, grand painted scenery, stop-motion-style creatures, classic adventure staging.",
    ["1960s", "60s", "technicolor", "adventure", "movie"]],
  ["1970s Grindhouse Cinema", "retro_screen", "Gritty grain and distressed colour.",
    "Still from 1970s grindhouse cinema: heavy film grain, scratches and dust, crushed contrast, faded distressed colour, gritty dramatic framing and lurid exploitation-film atmosphere.",
    ["1970s", "70s", "grindhouse", "film", "gritty"]],
  ["1980s Practical-Effects Horror", "retro_screen", "Latex creatures and tungsten light.",
    "Still from a 1980s practical-effects horror film: detailed latex and animatronic creature, slime and prosthetics, atmospheric smoke, warm tungsten and cold blue lighting, 35mm grain.",
    ["1980s", "80s", "horror", "practical effects", "monster"]],
  ["1990s Teen Sitcom", "retro_screen", "Bright studio sets and bold fashion.",
    "Still from a 1990s teen sitcom: bright evenly lit multi-camera studio set, bold colourful period fashion, cheerful staged poses, slightly soft broadcast-camera video texture.",
    ["1990s", "90s", "sitcom", "tv"]],
  ["Vintage Television Commercial", "retro_screen", "Staged smiles and product gloss.",
    "Still from a vintage television commercial: glossy over-lit studio photography, exaggerated staged expressions, hero product presentation, period colour stock and slight video softness. No logos or text.",
    ["commercial", "advert", "vintage", "tv"]],

  // 81–90: puppets, miniatures and physical media
  ["Felt Puppet Television", "puppets_miniatures", "Fuzzy felt, foam mouths, googly eyes.",
    "Photograph of a felt puppet television character: colourful fuzzy felt and fleece skin, oversized foam mouth, ping-pong or googly eyes, visible fabric texture and seams, cheerful bright puppet-show set lighting. Original puppet design.",
    ["puppet", "felt", "muppet", "tv"]],
  ["Hand Puppet Theater", "puppets_miniatures", "Stitched fabric puppets on a tiny stage.",
    "Photograph of a handmade fabric hand puppet: visible stitching, button and embroidered features, expressive handmade face, miniature painted theatre backdrop, warm stage spotlight.",
    ["puppet", "theater", "fabric", "handmade"]],
  ["Marionette Theater", "puppets_miniatures", "Carved wood and visible strings.",
    "Photograph of a carved wooden marionette: painted wood grain, articulated jointed limbs, visible control strings rising out of frame, miniature stage with velvet curtains, dramatic spotlight.",
    ["puppet", "marionette", "wood", "strings"]],
  ["Foam Latex Monster Puppet", "puppets_miniatures", "Practical creature with glass eyes.",
    "Photograph of a detailed foam latex monster puppet: textured painted foam skin, sculpted physical teeth, glossy glass eyes, practical-effects craftsmanship, dramatic theatrical lighting and haze.",
    ["puppet", "monster", "practical effects", "creature"]],
  ["Animatronic Creature", "puppets_miniatures", "Mechanical creature with silicone skin.",
    "Photograph of an animatronic creature on a film set: realistic articulated silicone skin, subtle mechanical seams, wet glossy eyes, cinematic creature photography with moody key light.",
    ["animatronic", "creature", "practical effects", "robot"]],
  ["Miniature Diorama", "puppets_miniatures", "A tiny handcrafted world.",
    "Photograph of a handcrafted miniature diorama: scale-model buildings and terrain, model foliage and flock grass, tiny painted figures, realistic miniature materials, macro lens depth of field.",
    ["miniature", "diorama", "model", "tiny"]],
  ["Action Figure Photography", "puppets_miniatures", "Collectible figure on a tabletop set.",
    "Tabletop photograph of a collectible action figure: molded plastic with visible articulation joints and paint lines, miniature scenery, dramatic coloured lighting, shallow depth of field. Original figure design, no packaging or logos.",
    ["toy", "action figure", "plastic", "collectible"]],
  ["Plush Toy Photography", "puppets_miniatures", "Soft, stitched and cuddly.",
    "Studio photograph of a plush toy: sewn fabric panels, soft stuffing, embroidered eyes and mouth, fuzzy tactile fibres, soft diffused studio lighting on a simple set.",
    ["plush", "toy", "cute", "stuffed"]],
  ["Cardboard Stop-Motion", "puppets_miniatures", "Corrugated cardboard characters.",
    "Stop-motion still made from cardboard: characters and set cut from corrugated card with visible fluting and rough cut edges, tape and glue details, small theatrical lighting.",
    ["cardboard", "stop motion", "handmade", "craft"]],
  ["Needle-Felted Sculpture", "puppets_miniatures", "Soft wool figures and cozy scenes.",
    "Photograph of a needle-felted wool sculpture: soft sculpted shapes, visible felt fibres and fuzz, gentle pastel wool colours, cozy miniature scene, soft window light.",
    ["felt", "wool", "craft", "cute"]],

  // 91–100: photography, lenses and optical effects
  ["Tilt-Shift Photography", "photography", "Real scenes that look like toys.",
    "Tilt-shift photograph: elevated viewpoint, narrow band of sharp focus with strong blur above and below, boosted saturation, making the real scene look like a miniature model world.",
    ["photo", "miniature", "tilt-shift"]],
  ["Extreme Macro Photography", "photography", "Microscopic texture and razor focus.",
    "Extreme macro photograph: extraordinary close-up of surface textures, razor-thin plane of focus, creamy background bokeh, dramatic macro lighting revealing tiny details.",
    ["photo", "macro", "close-up"]],
  ["Wildlife Documentary Photography", "photography", "Telephoto realism in the wild.",
    "Wildlife documentary photograph: natural habitat, realistic anatomy and behaviour, long telephoto lens compression, observational candid composition, natural light.",
    ["photo", "nature", "animal", "documentary"]],
  ["35mm Film Photography", "photography", "Analogue grain and gentle colour shifts.",
    "35mm film photograph: authentic analogue grain, gentle highlight roll-off, subtle colour shifts of consumer film stock, slight vignetting, natural imperfect candid feel.",
    ["photo", "film", "analog", "35mm"]],
  ["1970s Polaroid Snapshot", "photography", "Faded instant-film nostalgia.",
    "1970s instant-film snapshot: faded warm colours, soft low contrast, slight chemical blemishes, harsh flash or window light, nostalgic amateur composition. Picture area only, no white border.",
    ["photo", "polaroid", "1970s", "70s", "vintage"]],
  ["1980s Direct-Flash Photography", "photography", "On-camera flash and deep shadows.",
    "1980s direct-flash photograph: harsh on-camera flash, bright foreground and dark falloff, hard shadows behind the subject, saturated consumer colour film, candid party-snapshot feel.",
    ["photo", "flash", "1980s", "80s"]],
  ["Infrared Photography", "photography", "White foliage and alien skies.",
    "Infrared photograph: foliage glowing white or pink, dark dramatic skies, surreal false-colour tonal relationships, ethereal glow on highlights.",
    ["photo", "infrared", "surreal"]],
  ["Underwater Photography", "photography", "Caustics, particles and blue depth.",
    "Underwater photograph: blue-green water colour, rippling caustic light patterns, suspended particles and bubbles, light rays from the surface, realistic aquatic environment.",
    ["photo", "underwater", "ocean", "sea"]],
  ["Fisheye Lens Photography", "photography", "Extreme curved wide-angle.",
    "Fisheye lens photograph: extreme wide-angle barrel distortion, strongly curved horizon and lines, subject close to the lens and exaggerated, immersive circular perspective filling the frame.",
    ["photo", "fisheye", "wide angle"]],
  ["Long-Exposure Light Painting", "photography", "Glowing trails in the dark.",
    "Long-exposure night photograph with light painting: luminous swirling light trails tracing around the subject, deep atmospheric darkness, sharp static elements, glowing colourful streaks.",
    ["photo", "light painting", "night", "long exposure"]],
];

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/–/g, "-")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export const TOKEN_STYLES_V1: ReadonlyArray<TokenStyleV1> = ROWS.map(
  ([name, category, blurb, direction, keywords = []], index) => ({
    id: slugify(name),
    number: index + 1,
    name,
    category,
    blurb,
    direction,
    keywords,
  }),
);

const BY_ID = new Map(TOKEN_STYLES_V1.map((style) => [style.id, style]));

export function tokenStyleByIdV1(id: string | null | undefined): TokenStyleV1 | null {
  return id ? BY_ID.get(id) ?? null : null;
}

export const TOKEN_BLEND_WEIGHT_DEFAULT_V1 = 0.5;

/** The second style's share of a blend, kept where both styles still show. */
export function normalizeTokenBlendWeightV1(value: unknown): number {
  const n = typeof value === "number" && Number.isFinite(value) ? value : TOKEN_BLEND_WEIGHT_DEFAULT_V1;
  return Math.round(Math.min(0.8, Math.max(0.2, n)) * 20) / 20;
}

/** "Oil Painting", or "Oil Painting × Ukiyo-e" for a blend. */
export function tokenStyleLabelV1(
  styleId: string | null | undefined,
  blendStyleId?: string | null,
): string | null {
  const a = tokenStyleByIdV1(styleId);
  const b = tokenStyleByIdV1(blendStyleId);
  if (a && b && a.id !== b.id) return `${a.name} × ${b.name}`;
  return a?.name ?? b?.name ?? null;
}

/** `count` different styles, starting with `first` when given. */
export function pickDistinctTokenStylesV1(count: number, first: string | null, random: () => number = Math.random): string[] {
  const chosen: string[] = first && tokenStyleByIdV1(first) ? [first] : [];
  const pool = TOKEN_STYLES_V1.filter((s) => !chosen.includes(s.id));
  while (chosen.length < count && pool.length) {
    const [pick] = pool.splice(Math.floor(random() * pool.length), 1);
    chosen.push(pick.id);
  }
  return chosen;
}

/** Case-insensitive match on name, blurb, category and keywords. */
export function searchTokenStylesV1(query: string): TokenStyleV1[] {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (!terms.length) return [...TOKEN_STYLES_V1];
  const categoryLabel = new Map(TOKEN_STYLE_CATEGORIES_V1.map((c) => [c.id, c.label.toLowerCase()]));
  return TOKEN_STYLES_V1.filter((style) => {
    const haystack = [
      style.name,
      style.blurb,
      categoryLabel.get(style.category) ?? "",
      ...style.keywords,
    ]
      .join(" ")
      .toLowerCase();
    return terms.every((term) => haystack.includes(term));
  });
}
