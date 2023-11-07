import { Detail, ActionPanel } from "@raycast/api";
import { MutatePromise } from "@raycast/utils";
import { IssuePriorityValue, User } from "@linear/sdk";

import { IssueResult } from "../api/getIssues";

import useIssueDetail from "../hooks/useIssueDetail";

import { formatCycle } from "../helpers/cycles";
import { EstimateType, getEstimateLabel } from "../helpers/estimates";
import { priorityIcons } from "../helpers/priorities";
import { getStatusIcon } from "../helpers/states";
import { getUserIcon } from "../helpers/users";

import IssueActions from "./IssueActions";
import { format } from "date-fns";
import { getDateIcon } from "../helpers/dates";
import { getProjectIcon } from "../helpers/projects";
import { getMilestoneIcon } from "../helpers/milestones";

import { oauthClient } from "../api/oauth";

import fs from 'fs';
import https from 'https';
import path from 'path';
import url from 'url';
import { useState, useEffect } from "react";

type IssueDetailProps = {
  issue: IssueResult;
  mutateList?: MutatePromise<IssueResult[] | undefined>;
  priorities: IssuePriorityValue[] | undefined;
  users: User[] | undefined;
  me: User | undefined;
};

async function getAuthToken(): Promise<string> {
  const existingTokens = await oauthClient.getTokens();
  return existingTokens!.accessToken;
}

export default function IssueDetail({ issue: existingIssue, mutateList, priorities, users, me }: IssueDetailProps) {
  const { issue, isLoadingIssue, mutateDetail } = useIssueDetail(existingIssue);
  const [markdown, setMarkdown] = useState("");
  const [isLoadingMarkdown, setIsLoadingMarkdown] = useState(true);

  useEffect(() => {
    if (issue) {
      let origMarkdown = `# ${issue.title}`;
      if (issue.description) {
        origMarkdown += `\n\n${issue.description}`;
      }

      const urlRegex = /!\[([^\]]*)]\((https:\/\/uploads\.linear\.app\/[^\s]+)\)/g;
      const fetchImage = async (fullMatch: string, imageName: string, urlString: string): Promise<[string, string]> => {
        const parsedUrl = new url.URL(urlString);
        const pathComponents = parsedUrl.pathname.split("/");
        imageName = pathComponents[pathComponents.length - 1] + ".png";

        const outputPath = path.resolve("/tmp", `${imageName}`);
        const authToken = await getAuthToken();
        const options = {
          hostname: parsedUrl.hostname,
          path: parsedUrl.pathname,
          headers: {
            'Authorization': `Bearer ${authToken}`,
          },
        };

        return new Promise((resolve, reject) => {
          https.get(options, (res) => {
            const writer = fs.createWriteStream(outputPath);
            res.pipe(writer);

            writer.on('finish', () => resolve([fullMatch, `![${imageName}](file://${outputPath})`]));
            writer.on('error', reject);
          }).on('error', reject);
        });
      };

      const downloadAllImages = async () => {
        let markdown = origMarkdown;
        const matches = [...origMarkdown.matchAll(urlRegex)];

        for (let match of matches) {
          const [fullMatch, imageName, urlString] = match;

          const [oldText, newText] = await fetchImage(fullMatch, imageName, urlString);
          markdown = markdown.replace(oldText, newText);
        }

        setMarkdown(markdown);
        setIsLoadingMarkdown(false);
      };

      downloadAllImages().catch((err) => console.error(`Error fetching images: ${err}`));
    }
  }, [issue]);

  const cycle = issue?.cycle ? formatCycle(issue.cycle) : null;

  const relatedIssues = issue.relations ? issue.relations.nodes.filter((node) => node.type == "related") : null;
  const duplicateIssues = issue.relations ? issue.relations.nodes.filter((node) => node.type == "duplicate") : null;

  return (
    <Detail
      isLoading={isLoadingIssue || isLoadingMarkdown}
      markdown={markdown}
      {...(issue
        ? {
          metadata: (
            <Detail.Metadata>
              <Detail.Metadata.Label title="Status" text={issue.state.name} icon={getStatusIcon(issue.state)} />

              <Detail.Metadata.Label
                title="Priority"
                text={issue.priorityLabel}
                icon={{ source: priorityIcons[issue.priority] }}
              />

              <Detail.Metadata.Label
                title="Assignee"
                text={issue.assignee ? issue.assignee.displayName : "Unassigned"}
                icon={getUserIcon(issue.assignee)}
              />

              {issue.team.issueEstimationType !== EstimateType.notUsed ? (
                <Detail.Metadata.Label
                  title="Estimate"
                  text={getEstimateLabel({
                    estimate: issue.estimate,
                    issueEstimationType: issue.team.issueEstimationType,
                  })}
                  icon={{ source: { light: "light/estimate.svg", dark: "dark/estimate.svg" } }}
                />
              ) : null}

              {issue.labels.nodes.length > 0 ? (
                <Detail.Metadata.TagList title="Labels">
                  {issue.labels.nodes.map(({ id, name, color }) => (
                    <Detail.Metadata.TagList.Item key={id} text={name} color={color} />
                  ))}
                </Detail.Metadata.TagList>
              ) : (
                <Detail.Metadata.Label title="Labels" text="No Labels" />
              )}

              {issue.dueDate ? (
                <Detail.Metadata.Label
                  title="Due Date"
                  text={format(new Date(issue.dueDate), "MM/dd/yyyy")}
                  icon={getDateIcon(new Date(issue.dueDate))}
                />
              ) : null}

              <Detail.Metadata.Separator />

              <Detail.Metadata.Label
                title="Cycle"
                text={cycle ? cycle.title : "No Cycle"}
                icon={{ source: cycle ? cycle.icon : { light: "light/no-cycle.svg", dark: "dark/no-cycle.svg" } }}
              />

              <Detail.Metadata.Label
                title="Project"
                text={issue.project ? issue.project.name : "No Project"}
                icon={getProjectIcon(issue.project)}
              />

              <Detail.Metadata.Label
                title="Milestone"
                text={issue.projectMilestone ? issue.projectMilestone.name : "No Milestone"}
                icon={getMilestoneIcon(issue.projectMilestone)}
              />

              <Detail.Metadata.Label
                title="Parent Issue"
                text={issue.parent ? issue.parent.title : "No Issue"}
                icon={
                  issue.parent
                    ? getStatusIcon(issue.parent.state)
                    : { source: { light: "light/backlog.svg", dark: "dark/backlog.svg" } }
                }
              />

              {!!relatedIssues && relatedIssues.length > 0 ? (
                <Detail.Metadata.TagList title="Related">
                  {relatedIssues.map(({ id, relatedIssue }) => (
                    <Detail.Metadata.TagList.Item key={id} text={relatedIssue.identifier} />
                  ))}
                </Detail.Metadata.TagList>
              ) : null}

              {!!duplicateIssues && duplicateIssues.length > 0 ? (
                <Detail.Metadata.TagList title="Duplicates">
                  {duplicateIssues.map(({ id, relatedIssue }) => (
                    <Detail.Metadata.TagList.Item key={id} text={relatedIssue.identifier} />
                  ))}
                </Detail.Metadata.TagList>
              ) : null}
            </Detail.Metadata>
          ),
          actions: (
            <ActionPanel>
              <IssueActions
                issue={issue}
                mutateList={mutateList}
                mutateDetail={mutateDetail}
                priorities={priorities}
                users={users}
                me={me}
              />
            </ActionPanel>
          ),
        }
        : {})}
    />
  );
}
