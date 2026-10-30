export const PAPER_URL = "https://arxiv.org/abs/2609.34242";
export const ARTICLE_URL = "https://medium.com/data-science-at-microsoft/graphrag-beyond-the-demo-lessons-from-the-trenches-add83180f849";
export const STACCATO_URL = "https://github.com/microsoft/Staccato-Stuttered-ASR";

const paper = { label: "Stashbird paper", url: PAPER_URL };
const article = { label: "GraphRAG field notes", url: ARTICLE_URL };
const staccato = { label: "Staccato project", url: STACCATO_URL };

// Each unordered pair has one authored reply. Parallels are not biographical claims.
const pairs = [
  ["microsoft", "stashbird", "known", "I co-authored Stashbird: Episode-Grounded Lifecycle Reconciliation for Conversational Agent Memory while working at Microsoft.", [paper]],
  ["microsoft", "graphrag", "known", "I co-authored Microsoft GraphRAG field notes: lessons from taking GraphRAG beyond the demo.", [article]],
  ["microsoft", "bassoon", "playful", "Post-training by day, low notes by choice. Both benefit from good timing; only one comes with a reed."],
  ["microsoft", "archery", "playful", "Aim, evaluate, adjust, repeat. A useful loop for model work and for a target at the end of a range."],
  ["microsoft", "photography", "playful", "One asks for more compute. The other gives you a finite roll of film. Both make you think about what is worth keeping."],
  ["microsoft", "staccato", "known", "My brother stutters, so speech accessibility is personal to me. Our Staccato team took 1st in the Microsoft Global Hackathon's Ability Hack Executive Challenge.", [staccato]],
  ["microsoft", "evaluation", "known", "At Microsoft AI Development and Acceleration, I build agent harnesses and evaluation tools for research iteration."],
  ["microsoft", "museums", "playful", "A change of context: from building systems that interpret things to looking at things that refuse a single interpretation."],
  ["microsoft", "opensource", "known", "Staccato's speech-recognition code is public in Microsoft's GitHub organization. It is one place to see the implementation behind the idea.", [staccato]],

  ["stashbird", "graphrag", "known", "Two threads of my work: conversational memory and graph-based retrieval.", [paper, article]],
  ["stashbird", "bassoon", "playful", "A memory system and a bassoon: both have to know what to hold, what to release, and when to stop making noise."],
  ["stashbird", "archery", "playful", "Keep the useful signal; let go of the rest. A good rule for a memory system, and for the moment before releasing an arrow."],
  ["stashbird", "photography", "playful", "What deserves a place in the archive? One is a research question; the other is a good reason not to throw away the negatives."],
  ["stashbird", "staccato", "playful", "Remember what somebody meant, not just the raw sequence. Two very different projects, one reason to care about context."],
  ["stashbird", "evaluation", "known", "My conversational-memory work includes evaluating memory systems and keeping quality changes separate from infrastructure failures.", [paper]],
  ["stashbird", "museums", "playful", "My Rodin essay looked at how a work's meaning survives and changes. Agent memory is a different kind of question about what is worth carrying forward."],
  ["stashbird", "opensource", "playful", "A paper explains an idea. Code that others can inspect makes another kind of conversation possible. I like research that invites a second pair of eyes."],

  ["graphrag", "bassoon", "playful", "A good connection should carry a theme, not just join two dots. The graph version has edges; the musical version has phrases."],
  ["graphrag", "archery", "playful", "Retrieval is finding the right thing. Archery is trying very hard to hit it. Either way, 'somewhere nearby' is not quite the result you wanted."],
  ["graphrag", "photography", "playful", "Follow the relationships, not just the nearest match. A useful instinct for exploring a graph, or figuring out why two photographs belong together."],
  ["graphrag", "staccato", "playful", "A better route to the intended meaning: sometimes through relationships in a graph, sometimes through a second pass over speech."],
  ["graphrag", "evaluation", "known", "My GraphRAG-for-code prototype used quality checks to compare generated changelogs for faithfulness, coverage, and intent alignment.", [article]],
  ["graphrag", "museums", "playful", "A sculpture, its maker, its materials, its neighbors. Studying Rodin is a good reminder that relationships can change the whole story."],
  ["graphrag", "opensource", "playful", "Graphs make relationships inspectable; open code does the same for implementation choices. Both are better with something concrete to point at."],

  ["bassoon", "archery", "known", "Things I enjoy away from the screen: bassoon and archery. Good breath control, very different definitions of a good release."],
  ["bassoon", "photography", "known", "Things I enjoy away from the screen: bassoon and film photography. One develops a phrase; the other develops a negative."],
  ["bassoon", "staccato", "playful", "There is a musical word on one end of this line, but Staccato is a speech-accessibility project. The bassoon still gets to keep the low notes."],
  ["bassoon", "evaluation", "playful", "Play, listen, adjust. The oldest evaluation loop I know does not need a dashboard."],
  ["bassoon", "museums", "playful", "Two ways to spend time with something somebody made carefully: listen closely, or stand in front of it a little longer."],
  ["bassoon", "opensource", "playful", "A score lets someone else play a piece. Source code lets someone else try an idea. The interesting part starts when it leaves your hands."],

  ["archery", "photography", "known", "Things I enjoy away from the screen: archery and film photography. Frame the shot, then commit. Conveniently, that advice works twice."],
  ["archery", "staccato", "playful", "An arrow and an utterance both deserve a little room before the release. Neither gets better by rushing the person behind it."],
  ["archery", "evaluation", "playful", "The target makes feedback wonderfully explicit. Research evaluation is rarely that considerate."],
  ["archery", "museums", "playful", "Aiming at a point and looking beyond one: different exercises in attention. Please do not combine the equipment."],
  ["archery", "opensource", "playful", "Practice gets better with useful feedback. Publishing the target, the setup, and the misses makes that feedback a little easier to trust."],

  ["photography", "staccato", "playful", "A picture keeps a moment; a transcript keeps a voice. In both cases, the person matters more than a perfectly tidy artifact."],
  ["photography", "evaluation", "playful", "A sharp picture is not automatically a good picture. Convenient numbers are not automatically the right measure, either."],
  ["photography", "museums", "known", "Film photography and art museums are two ways I look more closely. I've volunteered on archival art documentation at Stanford's Cantor Arts Center and written about Rodin's lasting influence."],
  ["photography", "opensource", "playful", "Showing the contact sheet is different from showing the best frame. I appreciate the same openness about how a piece of software came together."],

  ["staccato", "evaluation", "playful", "Accuracy matters. So does whose speech the system can understand. A benchmark is only useful if it asks the right question."],
  ["staccato", "museums", "playful", "More ways to be heard, more ways to understand. Accessibility belongs wherever there is something worth sharing."],
  ["staccato", "opensource", "known", "The Staccato ASR/LLM pipeline is public, so others can inspect and experiment with a speech-accessibility idea that matters personally to me.", [staccato]],

  ["evaluation", "museums", "playful", "A five-star rating tells you less than a few minutes of careful attention. Some things need a richer rubric."],
  ["evaluation", "opensource", "playful", "Inspect the code, repeat the experiment, question the result. A useful evaluation should give someone else a way to disagree constructively."],

  ["museums", "opensource", "playful", "My Rodin sidequest was about learning by looking closely. Open code offers a different invitation to look beneath the finished surface."],
];

export function connectionKey(source, target) {
  return [source, target].sort().join("--");
}

export const CONNECTION_MATRIX = Object.freeze(Object.fromEntries(
  pairs.map(([source, target, kind, message, sources = []]) => [
    connectionKey(source, target),
    Object.freeze({
      source, target, kind, message,
      sources: Object.freeze(sources.map((link) => Object.freeze({ ...link }))),
    }),
  ]),
));
