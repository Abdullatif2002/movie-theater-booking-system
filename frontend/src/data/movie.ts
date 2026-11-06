
export interface movie {
  id: number;
  title: string;
  description: string;
  duration: number;
  poster: string;
}

export const movies: movie[] = [
  {
    id: 1,
    title: "The Last Signal",
    description:
      "A mysterious signal from space changes everything for a group of scientists.",
    duration: 125,
    poster: "https://placehold.co/400x600/191919/ffffff?text=The+Last+Signal",
  },
  {
    id: 2,
    title: "Midnight Run",
    description:
      "A detective races against time to solve a dangerous mystery in the city.",
    duration: 118,
    poster: "https://placehold.co/400x600/191919/ffffff?text=Midnight+Run",
  },
  {
    id: 3,
    title: "Beyond the Stars",
    description:
      "An astronaut begins an unforgettable journey beyond the solar system.",
    duration: 142,
    poster: "https://placehold.co/400x600/191919/ffffff?text=Beyond+the+Stars",
  },
  {
    id: 4,
    title: "The Hidden Kingdom",
    description:
      "A young adventurer discovers a secret kingdom hidden deep in the forest.",
    duration: 110,
    poster: "https://placehold.co/400x600/191919/ffffff?text=Hidden+Kingdom",
  },
  {
    id: 5,
    title: "Final Destination",
    description:
      "A group of friends must face unexpected challenges after a strange event.",
    duration: 132,
    poster: "https://placehold.co/400x600/191919/ffffff?text=Final+Destination",
  },
  {
    id: 6,
    title: "Lost in Time",
    description:
      "A scientist discovers a way to travel through time but faces unexpected consequences.",
    duration: 128,
    poster: "https://placehold.co/400x600/191919/ffffff?text=Lost+in+Time",
  },
];
