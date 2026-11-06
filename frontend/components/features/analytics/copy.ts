// Every label and explanation on the analytics dashboard, in one place.
//
// The audience for this page is a church admin, not an engineer. Labels say
// what a number is in everyday words; tips say how it is counted and what it
// is good for, in two or three short sentences. Technical terms (session,
// p95, median) appear only inside a tip, after the plain phrase.
//
// Admin UI is English-only, like the other admin pages.

export interface Copy {
  label: string
  tip: string
}

export const TILES = {
  visitors: {
    label: 'Daily visitors',
    tip: 'Different people who came, counted once per day. Someone who visits on two days counts as 2.',
  },
  peak: {
    label: 'Busiest day',
    tip: 'The single day in this period with the most different visitors, and the date it happened.',
  },
  visits: {
    label: 'Visits',
    tip: 'One visit is one person reading the site until they leave or pause for 30 minutes. A person can visit many times.',
  },
  visitLength: {
    label: 'Typical visit length',
    tip: 'How long a visit usually lasts, counting only time the page was on screen. Half are shorter, half longer.',
  },
  cameBack: {
    label: 'Came back',
    tip: 'Share of visits from people who had already visited on another day in the last 30 days.',
  },
  vietnamese: {
    label: 'Reading in Vietnamese',
    tip: 'Share of visits made with the site switched to Vietnamese. The rest were in English.',
  },
} satisfies Record<string, Copy>

export const SECTIONS = {
  trend: {
    label: 'Visitors over time',
    tip: 'Different visitors each day, split by the language they read in. Use the table toggle for exact numbers.',
  },
  heatmap: {
    label: 'When people visit',
    tip: 'Each square is one hour of one weekday. Darker means more page views at that time. Times are local to Saugus.',
  },
  topPages: {
    label: 'Most visited pages',
    tip: 'Which pages people opened most. The percentage is that page\'s share of all page views in the period.',
  },
  actions: {
    label: 'What people did',
    tip: 'What people did beyond opening pages: reading posts, switching language, browsing the calendar, reacting.',
  },
  devices: {
    label: 'Phone or computer',
    tip: 'Whether visitors were on a phone, a tablet or a computer when they opened a page.',
  },
  sources: {
    label: 'How people found us',
    tip: 'The site people came from. "Direct / typed" means a typed address, a bookmark, or a chat app that hides its origin.',
  },
  posts: {
    label: 'Which posts got read',
    tip: 'Each post with how often it was read this period and its total reactions. Read means on screen for a few seconds.',
  },
  pipeline: {
    label: 'Translations and new content',
    tip: 'How the automatic Vietnamese translation is doing, and how much new content was published.',
  },
  health: {
    label: 'Website health',
    tip: 'How the server is holding up: requests per part of the site, how many failed, and how fast it answered.',
  },
} satisfies Record<string, Copy>

export const PIPELINE_ROWS = {
  produced: {
    label: 'Translations the AI wrote',
    tip: 'New Vietnamese translations the AI wrote this period. A title and its body count as two.',
  },
  approvedUnedited: {
    label: 'Approved without changes',
    tip: 'Translations an admin approved exactly as the AI wrote them. Higher means the AI is doing well.',
  },
  approvedEdited: {
    label: 'Approved after edits',
    tip: 'Translations an admin corrected before approving. Each one also teaches the AI, see "Saved examples".',
  },
  pending: {
    label: 'Waiting for review',
    tip: 'Translations live on the site that no admin has checked yet. This is today\'s backlog, not this period.',
  },
  lead: {
    label: 'Typical wait until approved',
    tip: 'How long a translation usually waited between the AI writing it and an admin approving it.',
  },
  trainingPairs: {
    label: 'Saved examples for training the AI',
    tip: 'Approved translations saved as examples, so one day an AI of our own can learn how this congregation speaks.',
  },
  postsPublished: {
    label: 'Posts published',
    tip: 'Events, announcements, Bible studies, playlists and albums published in this period.',
  },
  reactionsAdded: {
    label: 'Reactions added',
    tip: 'Reactions left on posts this period. Reactions from before 5 Nov 2026 have no date and are not counted here.',
  },
} satisfies Record<string, Copy>

export const POST_COLUMNS = {
  title: { label: 'Post', tip: '' },
  type: { label: 'Kind', tip: '' },
  published: { label: 'Published', tip: '' },
  reads: {
    label: 'Times read',
    tip: 'How many times this post stayed on someone\'s screen for a couple of seconds in this period.',
  },
  reactions: {
    label: 'Reactions',
    tip: 'All reactions this post has ever received, not just in this period.',
  },
} satisfies Record<string, Copy>

export const HEALTH_COLUMNS = {
  route: {
    label: 'Part of the site',
    tip: 'The piece of the server that handled the request - for example the one that serves posts, or the calendar.',
  },
  requests: {
    label: 'Requests',
    tip: 'How many times that part of the server was asked for something. Opening one page can mean several requests.',
  },
  errors: {
    label: 'Failed',
    tip: 'Requests the server could not complete because something went wrong on our side. Zero is the goal.',
  },
  errorRate: {
    label: 'Failure rate',
    tip: 'Failed requests as a share of all requests to that part.',
  },
  p50: {
    label: 'Usual speed',
    tip: 'How long a typical request took, in milliseconds (1000 ms is a second). Half were faster, half slower.',
  },
  p95: {
    label: 'Slow moments',
    tip: 'How long the slowest 1 in 20 requests took, in the worst hour. Shows the bad moments the usual speed hides.',
  },
} satisfies Record<string, Copy>

// The three pills on the audience toggle. The owner removed the "Who to
// count" label and its tip (2026-11-06): the pill names explain themselves.
export const AUDIENCE_OPTIONS = { public: 'Visitors', admin: 'Admins', all: 'Everyone' } as const

export const EVENT_LABELS: Record<string, string> = {
  post_read: 'Read a post',
  locale_switch: 'Switched language',
  calendar_month_view: 'Browsed a calendar month',
  calendar_event_open: 'Opened a calendar day',
  gallery_album_open: 'Opened a photo album',
  reaction_add: 'Reacted to a post',
  outbound_click: 'Followed a link off the site',
}

export const DEVICE_LABELS: Record<string, string> = { phone: 'Phone', tablet: 'Tablet', desktop: 'Computer' }

export const TYPE_LABELS: Record<string, string> = {
  event: 'Event',
  announcement: 'Announcement',
  bible_study: 'Bible study',
  playlist: 'Playlist',
  gallery_album: 'Album',
}
