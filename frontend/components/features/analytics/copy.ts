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
    tip: 'How many different people came to the site, counted once per day. If the same person comes on Monday and again on Tuesday, that counts as 2. We cannot recognise the same person across days, on purpose - nothing about anyone is stored.',
  },
  peak: {
    label: 'Busiest day',
    tip: 'The single day in this period with the most different visitors, and the date it happened.',
  },
  visits: {
    label: 'Visits',
    tip: 'One visit is one person opening the site and reading until they leave or go quiet for 30 minutes. Opening a second browser tab counts as a second visit. One person can make several visits.',
  },
  visitLength: {
    label: 'Typical visit length',
    tip: 'How long a visit usually lasts, counting only the time the page was actually on screen. Half of visits are shorter than this, half are longer. A phone left in a pocket does not count.',
  },
  cameBack: {
    label: 'Came back',
    tip: 'Share of visits made by someone who had already visited on another day in the last 30 days. Their own browser remembers the date of their last visit; we never store who they are.',
  },
  vietnamese: {
    label: 'Reading in Vietnamese',
    tip: 'Share of visits made with the site switched to Vietnamese. The rest were in English.',
  },
} satisfies Record<string, Copy>

export const SECTIONS = {
  trend: {
    label: 'Visitors over time',
    tip: 'Different visitors per day (or per week for long periods), split by the language they were reading in. Click "Show table" to see the exact numbers.',
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
    tip: 'Things people did beyond just opening pages: reading a post, switching language, browsing the calendar, opening an album, reacting.',
  },
  devices: {
    label: 'Phone or computer',
    tip: 'Whether visitors were on a phone, a tablet or a computer when they opened a page.',
  },
  sources: {
    label: 'How people found us',
    tip: 'The website they were on just before arriving. "Direct / typed" means they typed the address, used a bookmark, or came from an app that hides where they came from (most chat apps do).',
  },
  posts: {
    label: 'Which posts got read',
    tip: 'Each post with how many times it was read in this period and how many reactions it has in total. A post counts as read when it stayed on screen for a couple of seconds.',
  },
  pipeline: {
    label: 'Translations and new content',
    tip: 'How the automatic English to Vietnamese translation is doing, and how much new content was published in this period.',
  },
  health: {
    label: 'Website health',
    tip: 'How the server behind the site is holding up: how many requests each part received, how many failed, and how fast it answered. Numbers arrive once an hour.',
  },
} satisfies Record<string, Copy>

export const PIPELINE_ROWS = {
  produced: {
    label: 'Translations the AI wrote',
    tip: 'New Vietnamese translations the AI produced in this period, one per field (a post title and its body are two).',
  },
  approvedUnedited: {
    label: 'Approved without changes',
    tip: 'Translations a bilingual admin approved exactly as the AI wrote them. The percentage is the share of all approvals. Higher means the AI is doing well.',
  },
  approvedEdited: {
    label: 'Approved after edits',
    tip: 'Translations an admin corrected before approving. Each one also teaches the AI, see "Saved examples".',
  },
  pending: {
    label: 'Waiting for review',
    tip: 'Translations currently showing on the site that no admin has checked yet. This is the review backlog, right now, not just this period.',
  },
  lead: {
    label: 'Typical wait until approved',
    tip: 'How long a translation usually waited between the AI writing it and an admin approving it. Half waited less, half waited more.',
  },
  trainingPairs: {
    label: 'Saved examples for training the AI',
    tip: 'Approved translations saved as examples. One day these could train a translation model of our own that knows how this congregation speaks.',
  },
  postsPublished: {
    label: 'Posts published',
    tip: 'Events, announcements, Bible studies, playlists and albums published in this period.',
  },
  reactionsAdded: {
    label: 'Reactions added',
    tip: 'Thumbs-up, hearts and other reactions visitors left on posts in this period. Reactions from before 5 Nov 2026 have no date and are not counted here, though they still show on the posts.',
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
    tip: 'How long a typical request took to answer, in milliseconds (1000 ms is one second). Half were faster, half slower.',
  },
  p95: {
    label: 'Slow moments',
    tip: 'How long the slowest 1 in 20 requests took, in the worst hour of this period. Shows the bad moments the typical number hides.',
  },
} satisfies Record<string, Copy>

export const AUDIENCE = {
  label: 'Who to count',
  tip: 'Visitors: people who are not signed in as admins - the congregation and the public. Admins: signed-in admins using the site. Everyone: both together. The owner\'s own visits are left out entirely.',
  options: { public: 'Visitors', admin: 'Admins', all: 'Everyone' } as const,
}

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
