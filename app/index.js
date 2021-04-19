// @ts-check
import YAML from 'yaml'
import { readFileSync } from 'fs'
import { Octokit } from '@octokit/core'

const [
    ,,
    REVIEW_SCHEME_FILE,
] = process.argv;

const {
    GITHUB_TOKEN,
    GITHUB_SHA,
    GITHUB_REPOSITORY,
    GITHUB_EVENT_PATH,
} = process.env;

const [ owner, repo ] = GITHUB_REPOSITORY.split('/');

const eventData = JSON.parse(readFileSync(GITHUB_EVENT_PATH, 'utf8'));

/** @type {{[x: string]: string[]}} */
const repoReviewers = YAML.parse(readFileSync(REVIEW_SCHEME_FILE, 'utf8'))[repo];

const octokit = new Octokit({ auth: GITHUB_TOKEN });

(async () => {
    const pr = eventData.pull_request;
    const reviewers = repoReviewers[pr.user.login];
    const reviews = await octokit.request('GET /repos/{owner}/{repo}/pulls/{pull_number}/reviews', {
        owner,
        repo,
        pull_number: pr.number,
        per_page: 100,
    });
    const lastReview = reviews.data[reviews.data.length - 1];
    if(lastReview?.commit_id === pr.head.sha){
        if(lastReview.state === 'APPROVED'){
            const reviewerIdx = reviewers.indexOf(lastReview.user.login);
            if(reviewerIdx === -1){
                console.error('FAIL: CANNOT FIND REVIEWER IN SCHEME. ABORTING...');
                process.exit(1);
            } else {
                const nextReviewer = reviewers[reviewerIdx];
                if(!nextReviewer){
                    await octokit.request('PUT /repos/{owner}/{repo}/pulls/{pull_number}/merge', {
                        owner,
                        repo,
                        pull_number: pr.number,
                        commit_title: `Merge pull request #${pr.number}`,
                        sha: pr.head.sha,
                    });
                } else {
                    octokit.request('POST /repos/{owner}/{repo}/pulls/{pull_number}/requested_reviewers', {
                        owner,
                        repo,
                        pull_number: pr.number,
                        reviewers: [ nextReviewer ],
                    });
                }
            }
        }
    } else {
        octokit.request('POST /repos/{owner}/{repo}/pulls/{pull_number}/requested_reviewers', {
            owner,
            repo,
            pull_number: pr.number,
            reviewers: [ reviewers[0] ],
        });
    }
})()
