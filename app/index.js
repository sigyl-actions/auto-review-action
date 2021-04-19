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
} = process.env;

const [ owner, repo ] = GITHUB_REPOSITORY.split('/');

/** @type {{[x: string]: string[]}} */
const repoReviewers = YAML.parse(readFileSync(REVIEW_SCHEME_FILE, 'utf8'))[repo];

const octokit = new Octokit({ auth: GITHUB_TOKEN });

/**
 * @template T
 * @param {T[]} list
 * @return {T}
 */
function getTargetPR(list){
    for(const pr of list){
        // @ts-ignore
        if(pr.head.sha === GITHUB_SHA) return pr;
    }
}

(async () => {
    const list = await octokit.request('GET /repos/{owner}/{repo}/pulls', {
        owner,
        repo,
        per_page: 100,
    });
    const pr = getTargetPR(list.data);
    const reviewers = repoReviewers[pr.user.login];
    const reviews = await octokit.request('GET /repos/{owner}/{repo}/pulls/{pull_number}/reviews', {
        owner,
        repo,
        pull_number: pr.id,
        per_page: 100,
    });
    const lastReview = reviews.data[reviews.data.length - 1];
    if(lastReview.commit_id === pr.head.sha){
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
                        pull_number: pr.id,
                        commit_title: `Merge pull request #${pr.id}`,
                        sha: pr.head.sha,
                    });
                } else {
                    octokit.request('POST /repos/{owner}/{repo}/pulls/{pull_number}/requested_reviewers', {
                        owner,
                        repo,
                        pull_number: pr.id,
                        reviewers: [ nextReviewer ],
                    });
                }
            }
        }
    } else {
        octokit.request('POST /repos/{owner}/{repo}/pulls/{pull_number}/requested_reviewers', {
            owner,
            repo,
            pull_number: pr.id,
            reviewers: [ reviewers[0] ],
        });
    }
})()
