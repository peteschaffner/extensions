import { Action, ActionPanel, Icon, List } from "@raycast/api";

import { IssueResult } from "../api/getIssues";

import useIssueComments from "../hooks/useIssueComments";
import useMe from "../hooks/useMe";

import IssueCommentForm from "./IssueCommentForm";
import IssueComment from "./IssueComment";

type IssueCommentsProps = {
  issue: IssueResult;
};

export default function IssueComments({ issue }: IssueCommentsProps) {
  const { me, isLoadingMe } = useMe();
  const { comments, isLoadingComments, mutateComments } = useIssueComments(issue.id);

  return (
    <List
      isLoading={isLoadingComments || isLoadingMe}
      navigationTitle={`${issue.identifier} • Comments`}
      searchBarPlaceholder="Filter by user or comment content"
      isShowingDetail
    >
      <>
        <List.EmptyView
          title="No comments"
          description="This issue doesn't have any comments."
          actions={
            <ActionPanel>
              <Action.Push
                title="Add Comment"
                icon={Icon.Plus}
                target={<IssueCommentForm issue={issue} mutateComments={mutateComments} />}
              />
            </ActionPanel>
          }
        />

        {comments?.map((comment) => {
          return <IssueComment key={comment.id} comment={comment} issue={issue} mutateComments={mutateComments} me={me} />
        })}
      </>
    </List>
  );
}
