import * as fs from 'fs/promises';
import * as readline from 'readline';

import { deepResearch, writeFinalReport } from './deep-research';
import { generateFeedback } from './feedback';
import { OutputManager } from './output-manager';

const output = new OutputManager();

// Helper function for consistent logging
function log(...args: any[]) {
  output.log(...args);
}

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

// Helper function to get user input
function askQuestion(query: string): Promise<string> {
  return new Promise(resolve => {
    rl.question(query, answer => {
      resolve(answer);
    });
  });
}

// Keep track of the previous research report
let previousReport = '';

// Perform research and write results
async function performResearch(query: string, breadth: number, depth: number, isFollowUp = false) {
  // For follow-up questions, include previous research context
  const contextualQuery = isFollowUp ? 
    `Previous Research:\n${previousReport}\n\nFollow-up Question: ${query}` : 
    query;

  if (!isFollowUp) {
    // Generate follow-up questions for initial query only
    const followUpQuestions = await generateFeedback({
      query: contextualQuery,
    });

    log(
      '\nTo better understand your research needs, please answer these follow-up questions (please keep your response concise):',
    );

    // Collect answers to follow-up questions
    const answers: string[] = [];
    for (const question of followUpQuestions) {
      const answer = await askQuestion(`\n${question}\nYour answer: `);
      answers.push(answer);
    }

    // Combine all information for deep research
    query = `
Initial Query: ${query}
Follow-up Questions and Answers:
${followUpQuestions.map((q: string, i: number) => `Q: ${q}\nA: ${answers[i]}`).join('\n')}
`;
  }

  log('\nResearching your topic...');
  log('\nStarting research with progress tracking...\n');
  
  const { learnings, visitedUrls } = await deepResearch({
    query: contextualQuery,
    breadth,
    depth,
    onProgress: (progress) => {
      output.updateProgress(progress);
    },
  });

  if (!isFollowUp) {
    // Only show detailed results for initial query
    log(`\n\nLearnings:\n\n${learnings.join('\n')}`);
    log(
      `\n\nVisited URLs (${visitedUrls.length}):\n\n${visitedUrls.join('\n')}`,
    );
  }
  
  const report = await writeFinalReport({
    prompt: contextualQuery,
    learnings,
    visitedUrls,
  });

  if (!isFollowUp) {
    // Save initial report to file
    await fs.writeFile('output.md', report, 'utf-8');
    previousReport = report;
    console.log(`\n\nInitial Research Report:\n\n${report}`);
    console.log('\nFull report has been saved to output.md');
  } else {
    // For follow-up questions, append to the report
    const followUpSection = `\n\n## Follow-up Question\n**Q:** ${query}\n\n**A:** ${report}`;
    await fs.appendFile('output.md', followUpSection, 'utf-8');
    
    // Update the previous report to include this answer
    previousReport += followUpSection;
    
    // Just show the answer in console
    console.log(`\n\nAnswer to follow-up question:\n${report}`);
    console.log('\nFollow-up Q&A has been appended to output.md');
  }
  
  return report;
}

// run the agent
async function run() {
  // Get initial query
  const initialQuery = await askQuestion('What would you like to research? ');

  // Get breath and depth parameters for initial research
  const breadth =
    parseInt(
      await askQuestion(
        'Enter research breadth (recommended 2-10, default 4): ',
      ),
      10,
    ) || 4;
  const depth =
    parseInt(
      await askQuestion('Enter research depth (recommended 1-5, default 2): '),
      10,
    ) || 2;

  log(`Creating research plan...`);

  // Perform initial research
  await performResearch(initialQuery, breadth, depth);

  // Handle follow-up questions
  while (true) {
    const followUpQuery = await askQuestion('\nEnter a follow-up question (or type "exit" to quit): ');
    
    if (followUpQuery.toLowerCase() === 'exit') {
      break;
    }

    // Use reduced depth and breadth for follow-up questions
    await performResearch(followUpQuery, Math.min(breadth, 2), Math.min(depth, 2), true);
  }

  rl.close();
}

run().catch(console.error);
