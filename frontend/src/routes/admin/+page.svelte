<script lang="ts">
	let { data } = $props();

	interface UserSummary {
		id: string;
		hcaSub: string;
		name: string | null;
		nickname: string | null;
		slackId: string | null;
		email: string;
		hackatimeConnected: boolean;
		perms: string | null;
		createdAt: string;
	}

	interface UserDetail extends UserSummary {
		twoEmails: boolean;
		updatedAt: string;
		perms: string | null;
		pipes: number;
		activeSessions: number;
		projects: { id: string; name: string; status: string; projectType: string; createdAt: string }[];
		orders: { id: string; itemName: string; quantity: number; pipesSpent: number; status: string; createdAt: string }[];
		auditLogs: { id: string; action: string; label: string; createdAt: string }[];
	}

	interface NewsItem {
		id: string;
		text: string;
		displayDate: string;
	}

	const isReviewer = $derived(data.role === 'Reviewer' || data.role === 'Fraud Reviewer');
	let activeTab = $state('users');
	let users: UserSummary[] = $state([]);
	let loading = $state(true);
	let userSearch = $state('');
	let permsFilter = $state('');
	let selectedUser: UserSummary | null = $state(null);
	let userDetail: UserDetail | null = $state(null);
	let detailLoading = $state(false);
	let showPermsDropdown = $state(false);
	let actionLoading = $state('');
	let lightMode = $state(false);

	// News state
	let newsItems: NewsItem[] = $state([]);
	let newsLoading = $state(false);
	let editingNews: NewsItem | null = $state(null);
	let newNewsText = $state('');
	let newNewsDate = $state('');
	let newsSaving = $state(false);

	// Projects state
	interface ProjectSummary {
		id: string;
		name: string;
		description: string;
		projectType: string;
		status: string;
		codeUrl: string | null;
		demoUrl: string | null;
		readmeUrl: string | null;
		screenshot1Url: string | null;
		screenshot2Url: string | null;
		hackatimeProjectName: string[];
		isUpdate: boolean;
		otherHcProgram: string | null;
		aiUse: string | null;
		createdAt: string;
		updatedAt: string;
		user: { id: string; name: string | null; slackId: string | null };
		latestSubmission: { id: string; changeDescription: string | null; minHoursConfirmed: boolean; status: string; createdAt: string } | null;
	}

	interface StatusCounts {
		unshipped: number;
		unreviewed: number;
		changes_needed: number;
		approved: number;
	}

	let allProjects: ProjectSummary[] = $state([]);
	let statusCounts: StatusCounts = $state({ unshipped: 0, unreviewed: 0, changes_needed: 0, approved: 0 });
	let projectsLoading = $state(false);
	let projectStatusFilter = $state('');
	let projectTypeFilter = $state('');
	let projectSearch = $state('');

	// Hackatime detail expansion
	interface HackatimeDetail {
		totalHours: number;
		earliestHeartbeat: number | null;
		previousApprovedHours: number;
		trustLevel: string | null;
		hackatimeProjects: { name: string; hours: number; languages: string[]; firstHeartbeat: number | null }[];
		unifiedDuplicate: boolean;
		unifiedError: boolean;
	}
	let expandedProjectId = $state<string | null>(null);
	let hackatimeData = $state<HackatimeDetail | null>(null);
	let hackatimeLoading = $state(false);
	let overrideJustification = $state('');
	let userFeedback = $state('');
	let internalNote = $state('');
	let reviewSubmitting = $state(false);
	let customHours = $state(0);
	let userFacingHours = $state(0);

	let selectedProject = $derived(allProjects.find(p => p.id === expandedProjectId) ?? null);
	let projScreenIdx = $state(0);

	interface ReviewRecord {
		id: string;
		status: string;
		feedback: string | null;
		internalNote?: string | null;
		overrideJustification: string | null;
		reviewerName: string | null;
		createdAt: string;
	}
	let pastReviews = $state<ReviewRecord[]>([]);

	async function reviewProject(status: 'approved' | 'changes_needed' | 'ban') {
		if (!expandedProjectId || reviewSubmitting) return;
		reviewSubmitting = true;
		try {
			const res = await fetch(`/api/admin/projects/${expandedProjectId}/review`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					status,
					feedback: userFeedback.trim() || null,
					internalNote: internalNote.trim() || null,
					overrideJustification: overrideJustification.trim() || null,
					overrideHours: userFacingHours,
					internalHours: customHours,
				}),
			});
			if (res.ok) {
				const proj = allProjects.find(p => p.id === expandedProjectId);
				if (proj) proj.status = status;
				// Reload reviews
				await loadReviews(expandedProjectId);
			}
		} finally {
			reviewSubmitting = false;
		}
	}

	async function loadReviews(projectId: string) {
		try {
			const res = await fetch(`/api/admin/projects/${projectId}/reviews`);
			if (res.ok) pastReviews = await res.json();
			else pastReviews = [];
		} catch {
			pastReviews = [];
		}
	}

	function buildJustification(adjustedHours: number, label: string) {
		if (!hackatimeData) return;
		const trustLabels: Record<string, string> = { blue: 'standard', yellow: 'warned', red: 'banned' };
		const trustLabel = trustLabels[hackatimeData.trustLevel?.toLowerCase() ?? ''] ?? hackatimeData.trustLevel ?? 'unknown';
		const proj = allProjects.find(p => p.id === expandedProjectId);
		const updateNote = proj?.isUpdate ? ' (this is an update to an existing project)' : '';
		const htNames = (hackatimeData.hackatimeProjects ?? []).map(p => p.name).join(', ');
		const htNamesNote = htNames ? `\nHackatime projects: ${htNames}` : '';
		const prevHours = hackatimeData.previousApprovedHours ?? 0;
		const deltaNote = prevHours > 0 ? `\nPreviously approved: ${prevHours}h — delta: ${Math.round((adjustedHours - prevHours) * 10) / 10}h` : '';
		overrideJustification = `the user has trust level ${trustLabel} and tracked ${hackatimeData.totalHours} hours on the project through hackatime (${label} to ${adjustedHours}h)${updateNote}${htNamesNote}${deltaNote}\n\nsigned off by ${data.user.name ?? 'unknown'}`;
	}

	function adjustHours(factor: number) {
		if (!hackatimeData) return;
		const adjusted = Math.round(hackatimeData.totalHours * factor * 10) / 10;
		customHours = adjusted;
		const label = factor === 0.5 ? 'halved' : factor === 1/3 ? 'reduced to a third' : `reduced to ${Math.round(factor * 100)}%`;
		buildJustification(adjusted, label);
	}

	function applyCustomHours() {
		if (!hackatimeData) return;
		const rounded = Math.round(customHours * 10) / 10;
		buildJustification(rounded, `adjusted`);
	}

	function buildInitialJustification(proj: ProjectSummary) {
		const trustLabels: Record<string, string> = { blue: 'standard', yellow: 'warned', red: 'banned' };
		const trustLabel = trustLabels[hackatimeData?.trustLevel?.toLowerCase() ?? ''] ?? hackatimeData?.trustLevel ?? 'unknown';
		const updateNote = proj.isUpdate ? ' (this is an update to an existing project)' : '';
		const unifiedNote = !hackatimeData?.unifiedDuplicate && !hackatimeData?.unifiedError && proj.codeUrl
			? `\nAs of ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })} this is the first submission of this code URL to unified.`
			: '';
		const htNames = (hackatimeData?.hackatimeProjects ?? []).map(p => p.name).join(', ');
		const htNamesNote = htNames ? `\nHackatime projects: ${htNames}` : '';
		const prevHours = hackatimeData?.previousApprovedHours ?? 0;
		const deltaNote = prevHours > 0 ? `\nPreviously approved: ${prevHours}h — delta: ${Math.round((customHours - prevHours) * 10) / 10}h` : '';
		overrideJustification = `the user has trust level ${trustLabel} and tracked ${hackatimeData?.totalHours ?? 0} hours on the project through hackatime${updateNote}${htNamesNote}${deltaNote}${unifiedNote}\n\nsigned off by ${data.user.name ?? 'unknown'}`;
	}

	async function selectProject(projectId: string) {
		if (expandedProjectId === projectId) {
			expandedProjectId = null;
			hackatimeData = null;
			userFeedback = '';
		internalNote = '';
			return;
		}
		expandedProjectId = projectId;
		projScreenIdx = 0;
		hackatimeData = null;
		userFeedback = '';
		internalNote = '';
		overrideJustification = '';
		pastReviews = [];

		const proj = allProjects.find(p => p.id === projectId);
		loadReviews(projectId);
		if (proj?.status === 'unreviewed') {
			hackatimeLoading = true;
			try {
				const res = await fetch(`/api/admin/projects/${projectId}/hackatime`);
				if (res.ok) {
					hackatimeData = await res.json();
				} else {
					hackatimeData = { totalHours: 0, earliestHeartbeat: null, previousApprovedHours: 0, hackatimeProjects: [], trustLevel: null, unifiedDuplicate: false, unifiedError: true };
				}
			} catch {
				hackatimeData = { totalHours: 0, earliestHeartbeat: null, previousApprovedHours: 0, hackatimeProjects: [], trustLevel: null, unifiedDuplicate: false, unifiedError: true };
			} finally {
				hackatimeLoading = false;
				customHours = hackatimeData?.totalHours ?? 0;
				userFacingHours = hackatimeData?.totalHours ?? 0;
				buildInitialJustification(proj);
			}
		}
	}

	function todayDateStr(): string {
		const d = new Date();
		return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
	}

	const PERMS_OPTIONS = ['User', 'Helper', 'Reviewer', 'Fraud Reviewer', 'Super Admin', 'Banned'];

	const PROJECT_TYPES = ['web', 'windows', 'mac', 'linux', 'cross-platform', 'python', 'android', 'ios'];

	let filteredProjects = $derived.by(() => {
		let result = allProjects;
		if (projectStatusFilter) {
			result = result.filter(p => p.status === projectStatusFilter);
		}
		if (projectTypeFilter) {
			result = result.filter(p => p.projectType === projectTypeFilter);
		}
		if (projectSearch.trim()) {
			const q = projectSearch.trim().toLowerCase();
			result = result.filter(p =>
				p.name.toLowerCase().includes(q) ||
				(p.user.name?.toLowerCase().includes(q)) ||
				(p.user.slackId?.toLowerCase().includes(q))
			);
		}
		return result;
	});

	const totalUsers = $derived(users.length);
	const totalHackatime = $derived(users.filter(u => u.hackatimeConnected).length);

	let filteredUsers = $derived.by(() => {
		let result = users;
		if (permsFilter) {
			result = result.filter(u => u.perms === permsFilter);
		}
		if (userSearch.trim()) {
			const q = userSearch.trim().toLowerCase();
			result = result.filter(u =>
				(u.name?.toLowerCase().includes(q)) ||
				(u.email?.toLowerCase().includes(q)) ||
				(u.slackId?.toLowerCase().includes(q))
			);
		}
		return result;
	});

	async function loadUsers() {
		loading = true;
		try {
			const res = await fetch('/api/admin/users');
			if (res.ok) users = await res.json();
		} finally {
			loading = false;
		}
	}

	async function selectUser(user: UserSummary) {
		selectedUser = user;
		userDetail = null;
		showPermsDropdown = false;
		detailLoading = true;
		try {
			const res = await fetch(`/api/admin/users/${user.id}`);
			if (res.ok) userDetail = await res.json();
		} finally {
			detailLoading = false;
		}
	}

	async function impersonateUser() {
		if (!selectedUser || !confirm(`Impersonate ${selectedUser.name ?? selectedUser.hcaSub}? You will browse the site as this user.`)) return;
		actionLoading = 'impersonate';
		try {
			const res = await fetch(`/api/admin/users/${selectedUser.id}/impersonate`, { method: 'POST' });
			if (res.ok) {
				// Full page navigation to pick up the new cookies
				window.location.replace('/home');
				return;
			}
			const err = await res.json().catch(() => ({}));
			alert(`Impersonation failed: ${res.status} ${err.error ?? ''}`);
		} finally {
			actionLoading = '';
		}
	}

	async function banUser() {
		if (!selectedUser || !confirm(`BAN this user? This will:\n- Set their Airtable status to Banned\n- Revoke all sessions\n- Redirect them to fraud.hackclub.com on any future login`)) return;
		actionLoading = 'ban';
		try {
			const res = await fetch(`/api/admin/users/${selectedUser.id}/ban`, { method: 'POST' });
			if (res.ok) {
				await selectUser(selectedUser);
			}
		} finally {
			actionLoading = '';
		}
	}

	async function updatePerms(perms: string) {
		if (!selectedUser || !confirm(`Change this user's permissions to "${perms}"?`)) return;
		actionLoading = 'perms';
		try {
			const res = await fetch(`/api/admin/users/${selectedUser.id}/perms`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ perms })
			});
			if (res.ok) {
				showPermsDropdown = false;
				await selectUser(selectedUser);
			}
		} finally {
			actionLoading = '';
		}
	}

	function closeDetail() {
		selectedUser = null;
		userDetail = null;
		showPermsDropdown = false;
	}

	function formatDate(d: string) {
		return new Date(d).toLocaleDateString('en-US', {
			year: 'numeric', month: 'short', day: 'numeric',
			hour: '2-digit', minute: '2-digit'
		});
	}

	async function loadNews() {
		newsLoading = true;
		try {
			const res = await fetch('/api/admin/news');
			if (res.ok) newsItems = await res.json();
		} finally {
			newsLoading = false;
		}
	}

	async function createNews() {
		if (!newNewsText.trim() || !newNewsDate.trim()) return;
		newsSaving = true;
		try {
			const res = await fetch('/api/admin/news', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ text: newNewsText, displayDate: newNewsDate })
			});
			if (res.ok) {
				newNewsText = '';
				newNewsDate = '';
				await loadNews();
			}
		} finally {
			newsSaving = false;
		}
	}

	async function saveNewsEdit() {
		if (!editingNews) return;
		newsSaving = true;
		try {
			const res = await fetch(`/api/admin/news/${editingNews.id}`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ text: editingNews.text, displayDate: editingNews.displayDate })
			});
			if (res.ok) {
				editingNews = null;
				await loadNews();
			}
		} finally {
			newsSaving = false;
		}
	}

	async function deleteNews(id: string) {
		if (!confirm('Delete this news item?')) return;
		newsSaving = true;
		try {
			const res = await fetch(`/api/admin/news/${id}`, { method: 'DELETE' });
			if (res.ok) await loadNews();
		} finally {
			newsSaving = false;
		}
	}

	async function loadProjects() {
		projectsLoading = true;
		try {
			const res = await fetch('/api/admin/projects');
			if (res.ok) {
				const data = await res.json();
				allProjects = data.projects;
				statusCounts = data.statusCounts;
			}
		} finally {
			projectsLoading = false;
		}
	}

	// Shop state
	interface ShopItemAdmin {
		id: string;
		name: string;
		description: string;
		imageUrl: string;
		priceHours: number;
		stock: number | null;
		sortOrder: number;
		isActive: boolean;
		estimatedShip: string | null;
	}
	let shopItemsList: ShopItemAdmin[] = $state([]);
	let shopLoading = $state(false);
	let shopSaving = $state(false);
	let editingShop: ShopItemAdmin | null = $state(null);
	let newShopName = $state('');
	let newShopDesc = $state('');
	let newShopImage = $state('');
	let newShopPrice = $state(0);
	let newShopStock = $state('');
	let newShopShip = $state('');
	let newShopActive = $state(true);
	let dragIdx: number | null = $state(null);
	let dragOverIdx: number | null = $state(null);

	async function loadShop() {
		shopLoading = true;
		try {
			const res = await fetch('/api/admin/shop');
			if (res.ok) shopItemsList = await res.json();
		} finally {
			shopLoading = false;
		}
	}

	async function createShopItem() {
		if (!newShopName.trim() || !newShopDesc.trim() || !newShopImage.trim() || !newShopPrice) return;
		shopSaving = true;
		try {
			const res = await fetch('/api/admin/shop', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					name: newShopName,
					description: newShopDesc,
					imageUrl: newShopImage,
					priceHours: newShopPrice,
					stock: newShopStock.trim() === '' ? null : parseInt(newShopStock),
					estimatedShip: newShopShip.trim() || null,
					isActive: newShopActive
				})
			});
			if (res.ok) {
				newShopName = '';
				newShopDesc = '';
				newShopImage = '';
				newShopPrice = 0;
				newShopStock = '';
				newShopShip = '';
				newShopActive = true;
				await loadShop();
			}
		} finally {
			shopSaving = false;
		}
	}

	async function saveShopEdit() {
		if (!editingShop) return;
		shopSaving = true;
		try {
			const res = await fetch(`/api/admin/shop/${editingShop.id}`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					name: editingShop.name,
					description: editingShop.description,
					imageUrl: editingShop.imageUrl,
					priceHours: editingShop.priceHours,
					stock: editingShop.stock,
					estimatedShip: editingShop.estimatedShip,
					isActive: editingShop.isActive
				})
			});
			if (res.ok) {
				editingShop = null;
				await loadShop();
			}
		} finally {
			shopSaving = false;
		}
	}

	async function deleteShopItem(id: string) {
		if (!confirm('Delete this shop item?')) return;
		shopSaving = true;
		try {
			const res = await fetch(`/api/admin/shop/${id}`, { method: 'DELETE' });
			if (res.ok) await loadShop();
		} finally {
			shopSaving = false;
		}
	}

	function handleDragStart(idx: number) {
		dragIdx = idx;
	}

	function handleDragOver(e: DragEvent, idx: number) {
		e.preventDefault();
		dragOverIdx = idx;
	}

	async function handleDrop(idx: number) {
		if (dragIdx === null || dragIdx === idx) {
			dragIdx = null;
			dragOverIdx = null;
			return;
		}
		const items = [...shopItemsList];
		const [moved] = items.splice(dragIdx, 1);
		items.splice(idx, 0, moved);
		shopItemsList = items;
		dragIdx = null;
		dragOverIdx = null;

		const reorderPayload = items.map((item, i) => ({ id: item.id, sortOrder: i }));
		try {
			await fetch('/api/admin/shop/reorder', {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ items: reorderPayload })
			});
		} catch { /* silent */ }
	}

	function handleDragEnd() {
		dragIdx = null;
		dragOverIdx = null;
	}

	// Fulfillment state
	interface AdminOrder {
		id: string;
		userId: string;
		shopItemId: string;
		itemName: string;
		quantity: number;
		pipesSpent: number;
		status: string;
		createdAt: string;
		updatedAt: string;
		userName: string;
		userSlackId: string | null;
		pendingSince: number | null;
	}
	let fulfillmentOrders: AdminOrder[] = $state([]);
	let fulfillmentLoading = $state(false);
	let fulfillmentItemFilter = $state('');
	let fulfillmentStatusFilter = $state('pending');
	let fulfillmentSortBy = $state<'oldest' | 'newest'>('oldest');
	let fulfillmentMsg = $state<Record<string, string>>({});
	let fulfillmentActionLoading = $state('');

	let fulfillmentItemOptions = $derived([...new Set(fulfillmentOrders.map(o => o.itemName))].sort());

	let filteredFulfillment = $derived.by(() => {
		let result = fulfillmentOrders;
		if (fulfillmentStatusFilter) {
			result = result.filter(o => o.status === fulfillmentStatusFilter);
		}
		if (fulfillmentItemFilter) {
			result = result.filter(o => o.itemName === fulfillmentItemFilter);
		}
		return result;
	});

	async function loadFulfillment() {
		fulfillmentLoading = true;
		try {
			const params = new URLSearchParams();
			if (fulfillmentStatusFilter) params.set('status', fulfillmentStatusFilter);
			params.set('sortBy', fulfillmentSortBy);
			const qs = params.toString();
			const res = await fetch(`/api/admin/orders${qs ? `?${qs}` : ''}`);
			if (res.ok) fulfillmentOrders = await res.json();
		} finally {
			fulfillmentLoading = false;
		}
	}

	async function fulfillOrder(orderId: string) {
		if (!confirm('Mark this order as fulfilled? The user will be notified.')) return;
		fulfillmentActionLoading = orderId;
		try {
			const res = await fetch(`/api/admin/orders/${orderId}/fulfill`, { method: 'POST' });
			if (res.ok) await loadFulfillment();
		} finally {
			fulfillmentActionLoading = '';
		}
	}

	async function sendOrderMessage(orderId: string) {
		const msg = fulfillmentMsg[orderId]?.trim();
		if (!msg) return;
		fulfillmentActionLoading = orderId;
		try {
			const res = await fetch(`/api/admin/orders/${orderId}/message`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ message: msg })
			});
			if (res.ok) {
				fulfillmentMsg[orderId] = '';
			}
		} finally {
			fulfillmentActionLoading = '';
		}
	}

	function formatPendingTime(hours: number | null): string {
		if (hours === null) return '';
		if (hours < 1) return 'just now';
		if (hours < 24) return `${hours}h`;
		const days = Math.floor(hours / 24);
		return `${days}d ${hours % 24}h`;
	}

	$effect(() => {
		if (isReviewer && activeTab === 'users') {
			activeTab = 'projects';
			return;
		}
		if (activeTab === 'users') loadUsers();
		if (activeTab === 'news') loadNews();
		if (activeTab === 'projects') loadProjects();
		if (activeTab === 'shop') loadShop();
		if (activeTab === 'fulfillment') loadFulfillment();
	});
</script>

<div class="admin-shell" class:light={lightMode}>
	<header class="admin-header">
		<h1>{isReviewer ? 'Review Panel' : 'Admin Panel'}</h1>
		<div style="display:flex;align-items:center;gap:0.75rem;">
			<button class="theme-toggle" onclick={() => lightMode = !lightMode}>{lightMode ? 'Dark' : 'Light'}</button>
			<span class="admin-user">Logged in as {data.user.name}</span>
		</div>
	</header>

	<nav class="admin-tabs">
		{#if !isReviewer}
			<button class="tab" class:active={activeTab === 'users'} onclick={() => { activeTab = 'users'; closeDetail(); }}>Users</button>
			<button class="tab" class:active={activeTab === 'news'} onclick={() => activeTab = 'news'}>News</button>
			<button class="tab" class:active={activeTab === 'shop'} onclick={() => activeTab = 'shop'}>Shop</button>
			<button class="tab" class:active={activeTab === 'fulfillment'} onclick={() => activeTab = 'fulfillment'}>Fulfillment</button>
		{/if}
		<button class="tab" class:active={activeTab === 'projects'} onclick={() => activeTab = 'projects'}>Projects</button>
		<a href="/home" class="tab tab-home">Home</a>
	</nav>

	<main class="admin-content">
		{#if activeTab === 'users'}
			<div class="users-layout" class:has-detail={selectedUser}>
				<div class="users-table-wrap">
					<div class="stat-cards">
						<div class="stat-card">
							<span class="stat-value">{totalUsers}</span>
							<span class="stat-label">Total Users</span>
						</div>
						<div class="stat-card">
							<span class="stat-value">{totalHackatime}</span>
							<span class="stat-label">Hackatime Linked</span>
						</div>
					</div>
					<div class="users-toolbar">
						<input type="text" placeholder="Search by name, email or Slack ID..." bind:value={userSearch} class="users-search" />
						<select bind:value={permsFilter} class="users-perms-filter">
							<option value="">All Permissions</option>
							{#each PERMS_OPTIONS as perm}
								<option value={perm}>{perm}</option>
							{/each}
						</select>
					</div>
					{#if loading}
						<p class="loading">Loading users...</p>
					{:else}
						<table class="users-table">
							<thead>
								<tr>
									<th>Name</th>
									<th>Email</th>
									<th>Perms</th>
									<th>Slack ID</th>
									<th>Hackatime</th>
									<th>Joined</th>
								</tr>
							</thead>
							<tbody>
								{#each filteredUsers as user}
									<tr
										class:selected={selectedUser?.id === user.id}
										onclick={() => selectUser(user)}
									>
										<td>{user.name ?? '—'}</td>
										<td class="mono">{user.email}</td>
										<td><span class="badge" class:banned={user.perms === 'Banned'}>{user.perms ?? '—'}</span></td>
										<td class="mono">{user.slackId ?? '—'}</td>
										<td>{user.hackatimeConnected ? 'Yes' : 'No'}</td>
										<td>{formatDate(user.createdAt)}</td>
									</tr>
								{/each}
							</tbody>
						</table>
						{#if filteredUsers.length === 0}
							<p class="empty">No users found.</p>
						{/if}
					{/if}
				</div>

				{#if selectedUser}
					<div class="detail-panel">
						<div class="detail-header">
							<h2>{selectedUser.name ?? 'Unknown'}</h2>
							<button class="close-btn" onclick={closeDetail}>&times;</button>
						</div>

						{#if detailLoading}
							<p class="loading">Loading...</p>
						{:else if userDetail}
							<div class="detail-sections">
								<section class="detail-section">
									<h3>Info</h3>
									<dl>
										<dt>ID</dt><dd class="mono">{userDetail.id}</dd>
										<dt>HCA Sub</dt><dd class="mono">{userDetail.hcaSub}</dd>
										<dt>Name</dt><dd>{userDetail.name ?? '—'}</dd>
										<dt>Email</dt><dd class="mono">{userDetail.email}</dd>
										<dt>Nickname</dt><dd>{userDetail.nickname ?? '—'}</dd>
										<dt>Slack ID</dt><dd class="mono">{userDetail.slackId ?? '—'}</dd>
										<dt>Hackatime</dt><dd>{userDetail.hackatimeConnected ? 'Connected' : 'Not connected'}</dd>
										<dt>Perms</dt><dd><span class="badge" class:banned={userDetail.perms === 'Banned'}>{userDetail.perms ?? 'Unknown'}</span></dd>
										<dt>Active Sessions</dt><dd>{userDetail.activeSessions}</dd>
										<dt>Joined</dt><dd>{formatDate(userDetail.createdAt)}</dd>
									</dl>
								</section>

								<section class="detail-section">
									<h3>Actions</h3>
									<div class="actions">
										<div class="perms-action">
											<button class="btn btn-promote" onclick={() => showPermsDropdown = !showPermsDropdown} disabled={actionLoading !== ''}>
												Promote / Change Role
											</button>
											{#if showPermsDropdown}
												<div class="perms-dropdown">
													{#each PERMS_OPTIONS as perm}
														<button
															class="perms-option"
															class:current={userDetail.perms === perm}
															onclick={() => updatePerms(perm)}
															disabled={userDetail.perms === perm || actionLoading !== ''}
														>
															{perm}
														</button>
													{/each}
												</div>
											{/if}
										</div>

										<button class="btn btn-ban" onclick={banUser} disabled={actionLoading !== '' || userDetail.perms === 'Banned'}>
											{actionLoading === 'ban' ? 'Banning...' : 'Ban User'}
										</button>

										<button class="btn btn-impersonate" onclick={impersonateUser} disabled={actionLoading !== '' || userDetail.perms === 'Banned'}>
											{actionLoading === 'impersonate' ? 'Starting...' : 'Impersonate'}
										</button>
									</div>
								</section>

								{#if userDetail.projects?.length > 0}
									<section class="detail-section">
										<h3>Projects ({userDetail.projects.length})</h3>
										<div class="scrollable-table">
											<table class="mini-table">
												<thead><tr><th>Name</th><th>Type</th><th>Status</th><th>Created</th></tr></thead>
												<tbody>
													{#each userDetail.projects as project}
														<tr>
															<td>{project.name}</td>
															<td>{project.projectType}</td>
															<td><span class="badge badge-{project.status}">{project.status}</span></td>
															<td>{formatDate(project.createdAt)}</td>
														</tr>
													{/each}
												</tbody>
											</table>
										</div>
									</section>
								{/if}

								<section class="detail-section">
									<h3>Pipes Balance: {userDetail.pipes ?? 0}</h3>
								</section>

								{#if userDetail.orders?.length > 0}
									<section class="detail-section">
										<h3>Orders</h3>
										<table class="mini-table">
											<thead><tr><th>Item</th><th>Qty</th><th>Pipes</th><th>Status</th><th>When</th></tr></thead>
											<tbody>
												{#each userDetail.orders as order}
													<tr>
														<td>{order.itemName}</td>
														<td>{order.quantity}</td>
														<td>{order.pipesSpent}</td>
														<td><span class="status-badge" class:status-pending={order.status === 'pending'} class:status-fulfilled={order.status === 'fulfilled'}>{order.status}</span></td>
														<td>{formatDate(order.createdAt)}</td>
													</tr>
												{/each}
											</tbody>
										</table>
									</section>
								{/if}

								{#if userDetail.auditLogs?.length > 0}
									<section class="detail-section">
										<h3>Audit Log</h3>
										<table class="mini-table">
											<thead><tr><th>Action</th><th>Label</th><th>When</th></tr></thead>
											<tbody>
												{#each userDetail.auditLogs as log}
													<tr>
														<td class="mono">{log.action}</td>
														<td>{log.label}</td>
														<td>{formatDate(log.createdAt)}</td>
													</tr>
												{/each}
											</tbody>
										</table>
									</section>
								{/if}
							</div>
						{/if}
					</div>
				{/if}
			</div>
		{:else if activeTab === 'news'}
			<div class="news-admin">
				<div class="news-form">
					<h3>Add News Item</h3>
					<div class="news-form-fields">
						<div class="news-date-row">
							<input type="date" bind:value={newNewsDate} class="news-input news-input-date" />
							<button class="btn btn-now" onclick={() => newNewsDate = todayDateStr()}>Now</button>
						</div>
						<textarea placeholder="News text..." bind:value={newNewsText} class="news-input news-input-text" rows="2"></textarea>
						<button class="btn btn-add-news" onclick={createNews} disabled={newsSaving || !newNewsText.trim() || !newNewsDate}>
							{newsSaving ? 'Saving...' : 'Add'}
						</button>
					</div>
				</div>

				{#if newsLoading}
					<p class="loading">Loading news...</p>
				{:else if newsItems.length === 0}
					<p class="empty">No news items yet.</p>
				{:else}
					<table class="users-table">
						<thead>
							<tr>
								<th>Date</th>
								<th>Text</th>
								<th>Actions</th>
							</tr>
						</thead>
						<tbody>
							{#each newsItems as item}
								<tr>
									{#if editingNews?.id === item.id}
										<td><input type="date" bind:value={editingNews.displayDate} class="news-edit-input" /></td>
										<td><textarea bind:value={editingNews.text} class="news-edit-input news-edit-text" rows="2"></textarea></td>
										<td class="news-actions">
											<button class="btn btn-save" onclick={saveNewsEdit} disabled={newsSaving}>Save</button>
											<button class="btn btn-cancel" onclick={() => editingNews = null}>Cancel</button>
										</td>
									{:else}
										<td>{item.displayDate}</td>
										<td>{item.text}</td>
										<td class="news-actions">
											<button class="btn btn-edit" onclick={() => editingNews = { ...item }}>Edit</button>
											<button class="btn btn-delete" onclick={() => deleteNews(item.id)} disabled={newsSaving}>Delete</button>
										</td>
									{/if}
								</tr>
							{/each}
						</tbody>
					</table>
				{/if}
			</div>
		{:else if activeTab === 'fulfillment'}
			<div class="fulfillment-admin">
				<div class="fulfillment-toolbar">
					<select bind:value={fulfillmentStatusFilter} class="users-perms-filter" onchange={() => loadFulfillment()}>
						<option value="">All Statuses</option>
						<option value="pending">Pending</option>
						<option value="fulfilled">Fulfilled</option>
					</select>
					<select bind:value={fulfillmentItemFilter} class="users-perms-filter">
						<option value="">All Items</option>
						{#each fulfillmentItemOptions as item}
							<option value={item}>{item}</option>
						{/each}
					</select>
					<select bind:value={fulfillmentSortBy} class="users-perms-filter" onchange={() => loadFulfillment()}>
						<option value="oldest">Oldest First</option>
						<option value="newest">Newest First</option>
					</select>
				</div>

				{#if fulfillmentLoading}
					<p class="placeholder">Loading orders...</p>
				{:else if filteredFulfillment.length === 0}
					<p class="placeholder">No orders found.</p>
				{:else}
					<table class="admin-table">
						<thead>
							<tr>
								<th>Item</th>
								<th>User</th>
								<th>Qty</th>
								<th>Pipes</th>
								<th>Status</th>
								<th>Waiting</th>
								<th>Actions</th>
							</tr>
						</thead>
						<tbody>
							{#each filteredFulfillment as order}
								<tr class:fulfilled={order.status === 'fulfilled'}>
									<td>{order.itemName}</td>
									<td>{order.userName}{order.userSlackId ? ` (${order.userSlackId})` : ''}</td>
									<td>{order.quantity}</td>
									<td>{order.pipesSpent}</td>
									<td><span class="status-badge" class:status-pending={order.status === 'pending'} class:status-fulfilled={order.status === 'fulfilled'}>{order.status}</span></td>
									<td>{order.pendingSince !== null ? formatPendingTime(order.pendingSince) : '—'}</td>
									<td class="fulfillment-actions">
										{#if order.status === 'pending'}
											<button class="btn btn-sm btn-primary" onclick={() => fulfillOrder(order.id)} disabled={fulfillmentActionLoading === order.id}>
												{fulfillmentActionLoading === order.id ? '...' : 'Fulfill'}
											</button>
										{/if}
										<div class="fulfillment-msg-row">
											<input
												type="text"
												placeholder="Custom message..."
												bind:value={fulfillmentMsg[order.id]}
												class="fulfillment-msg-input"
												maxlength="500"
											/>
											<button
												class="btn btn-sm"
												onclick={() => sendOrderMessage(order.id)}
												disabled={!fulfillmentMsg[order.id]?.trim() || fulfillmentActionLoading === order.id}
											>Send</button>
										</div>
									</td>
								</tr>
							{/each}
						</tbody>
					</table>
				{/if}
			</div>
		{:else if activeTab === 'shop'}
			<div class="shop-admin">
				<div class="shop-form">
					<h3>Add Shop Item</h3>
					<div class="shop-form-grid">
						<input type="text" placeholder="Name" bind:value={newShopName} class="shop-input" />
						<input type="text" placeholder="Image URL (e.g. /images/shop/item.webp)" bind:value={newShopImage} class="shop-input" />
						<textarea placeholder="Description" bind:value={newShopDesc} class="shop-input shop-textarea" rows="2"></textarea>
						<div class="shop-form-row">
							<label class="shop-field">
								<span>Price (hours)</span>
								<input type="number" min="1" bind:value={newShopPrice} class="shop-input shop-input-sm" />
							</label>
							<label class="shop-field">
								<span>Stock (blank = infinite)</span>
								<input type="text" placeholder="∞" bind:value={newShopStock} class="shop-input shop-input-sm" />
							</label>
							<label class="shop-field">
								<span>Est. shipping</span>
								<input type="text" placeholder="e.g. 2-3 weeks" bind:value={newShopShip} class="shop-input shop-input-sm" />
							</label>
						</div>
						<div class="shop-form-row">
							<label class="shop-checkbox">
								<input type="checkbox" bind:checked={newShopActive} />
								<span>Active (visible to users)</span>
							</label>
							<button class="btn btn-add-shop" onclick={createShopItem} disabled={shopSaving || !newShopName.trim() || !newShopImage.trim() || !newShopPrice}>
								{shopSaving ? 'Saving...' : 'Add Item'}
							</button>
						</div>
					</div>
				</div>

				{#if shopLoading}
					<p class="loading">Loading shop items...</p>
				{:else if shopItemsList.length === 0}
					<p class="empty">No shop items yet.</p>
				{:else}
					<div class="shop-items-list">
						{#each shopItemsList as item, idx}
							<div
								class="shop-item-row"
								class:dragging={dragIdx === idx}
								class:drag-over={dragOverIdx === idx}
								class:inactive={!item.isActive}
								draggable="true"
								role="listitem"
								ondragstart={() => handleDragStart(idx)}
								ondragover={(e) => handleDragOver(e, idx)}
								ondrop={() => handleDrop(idx)}
								ondragend={handleDragEnd}
							>
								<div class="shop-item-drag-handle" title="Drag to reorder">&#x2630;</div>
								{#if editingShop?.id === item.id}
									<div class="shop-item-edit">
										<input type="text" bind:value={editingShop.name} class="shop-input" />
										<input type="text" bind:value={editingShop.imageUrl} class="shop-input" placeholder="Image URL" />
										<textarea bind:value={editingShop.description} class="shop-input shop-textarea" rows="2"></textarea>
										<div class="shop-form-row">
											<label class="shop-field">
												<span>Price (h)</span>
												<input type="number" min="1" bind:value={editingShop.priceHours} class="shop-input shop-input-sm" />
											</label>
											<label class="shop-field">
												<span>Stock</span>
												<input type="number" min="0" value={editingShop.stock ?? ''} oninput={(e) => { const v = (e.target as HTMLInputElement).value; editingShop!.stock = v === '' ? null : parseInt(v); }} class="shop-input shop-input-sm" placeholder="∞" />
											</label>
											<label class="shop-field">
												<span>Est. ship</span>
												<input type="text" bind:value={editingShop.estimatedShip} class="shop-input shop-input-sm" placeholder="e.g. 2-3 weeks" />
											</label>
										</div>
										<div class="shop-form-row">
											<label class="shop-checkbox">
												<input type="checkbox" bind:checked={editingShop.isActive} />
												<span>Active</span>
											</label>
											<div class="shop-edit-actions">
												<button class="btn btn-save" onclick={saveShopEdit} disabled={shopSaving}>Save</button>
												<button class="btn btn-cancel" onclick={() => editingShop = null}>Cancel</button>
											</div>
										</div>
									</div>
								{:else}
									<div class="shop-item-preview">
										<img src={item.imageUrl} alt={item.name} class="shop-item-thumb" />
										<div class="shop-item-info">
											<strong>{item.name}</strong>
											<span class="shop-item-meta">{item.priceHours}h · {item.stock === null ? '∞' : item.stock} stock{item.estimatedShip ? ` · ${item.estimatedShip}` : ''}{!item.isActive ? ' · HIDDEN' : ''}</span>
										</div>
									</div>
									<div class="shop-item-actions">
										<button class="btn btn-edit" onclick={() => editingShop = { ...item }}>Edit</button>
										<button class="btn btn-delete" onclick={() => deleteShopItem(item.id)} disabled={shopSaving}>Delete</button>
									</div>
								{/if}
							</div>
						{/each}
					</div>
				{/if}
			</div>
		{:else if activeTab === 'projects'}
			<div class="projects-admin">
				<div class="status-pills">
					<button class="pill" class:active={projectStatusFilter === ''} onclick={() => projectStatusFilter = ''}>
						All <span class="pill-count">{statusCounts.unshipped + statusCounts.unreviewed + statusCounts.changes_needed + statusCounts.approved}</span>
					</button>
					<button class="pill pill-unshipped" class:active={projectStatusFilter === 'unshipped'} onclick={() => projectStatusFilter = projectStatusFilter === 'unshipped' ? '' : 'unshipped'}>
						Unshipped <span class="pill-count">{statusCounts.unshipped}</span>
					</button>
					<button class="pill pill-unreviewed" class:active={projectStatusFilter === 'unreviewed'} onclick={() => projectStatusFilter = projectStatusFilter === 'unreviewed' ? '' : 'unreviewed'}>
						Unreviewed <span class="pill-count">{statusCounts.unreviewed}</span>
					</button>
					<button class="pill pill-changes_needed" class:active={projectStatusFilter === 'changes_needed'} onclick={() => projectStatusFilter = projectStatusFilter === 'changes_needed' ? '' : 'changes_needed'}>
						Changes Needed <span class="pill-count">{statusCounts.changes_needed}</span>
					</button>
					<button class="pill pill-approved" class:active={projectStatusFilter === 'approved'} onclick={() => projectStatusFilter = projectStatusFilter === 'approved' ? '' : 'approved'}>
						Approved <span class="pill-count">{statusCounts.approved}</span>
					</button>
				</div>

				<div class="users-toolbar">
					<input type="text" placeholder="Search by project name, user name or Slack ID..." bind:value={projectSearch} class="users-search" />
					<select bind:value={projectTypeFilter} class="type-filter-select">
						<option value="">All Types</option>
						{#each PROJECT_TYPES as t}
							<option value={t}>{t}</option>
						{/each}
					</select>
				</div>

				{#if projectsLoading}
					<p class="loading">Loading projects...</p>
				{:else}
					<div class="proj-split">
						<div class="proj-sidebar">
							{#if filteredProjects.length === 0}
								<p class="empty">No projects found.</p>
							{:else}
								{#each filteredProjects as project}
									<button
										class="proj-sidebar-item"
										class:active={expandedProjectId === project.id}
										onclick={() => selectProject(project.id)}
									>
										<span class="proj-sidebar-name">
											{project.name}
											{#if project.hackatimeProjectName?.length > 0}
												<span class="ht-pill" title="Hackatime linked: {project.hackatimeProjectName.join(', ')}">HT</span>
											{/if}
										</span>
										<span class="proj-sidebar-meta">
											{project.user.name ?? '—'}
											<span class="badge badge-{project.status} badge-sm">{project.status}</span>
										</span>
									</button>
								{/each}
							{/if}
						</div>

						<div class="proj-main">
							{#if selectedProject}
								<div class="proj-top-row">
									<div class="proj-top-info">
										<div class="proj-main-header">
											<h3 class="proj-main-title">{selectedProject.name}</h3>
											<span class="badge badge-{selectedProject.status}">{selectedProject.status}</span>
										</div>

										<p class="proj-main-desc">{selectedProject.description}</p>

										<div class="proj-main-meta">
											<span>Type: <strong>{selectedProject.projectType}</strong></span>
											<span>User: <strong>{selectedProject.user.name ?? '—'}</strong>{selectedProject.user.slackId ? ` (${selectedProject.user.slackId})` : ''}</span>
											<span>Update: <strong>{selectedProject.isUpdate ? 'Yes' : 'No'}</strong></span>
											<span>Created: <strong>{formatDate(selectedProject.createdAt)}</strong></span>
										</div>

										<div class="ht-actions">
											{#if selectedProject.codeUrl}
												<a href={selectedProject.codeUrl} target="_blank" rel="noopener" class="ht-btn ht-btn-github">GitHub</a>
											{/if}
											{#if selectedProject.demoUrl}
												<a href={selectedProject.demoUrl} target="_blank" rel="noopener" class="ht-btn ht-btn-demo">Demo</a>
											{/if}
											{#if selectedProject.readmeUrl}
												<a href={selectedProject.readmeUrl} target="_blank" rel="noopener" class="ht-btn ht-btn-readme">README</a>
											{/if}
											{#if !selectedProject.codeUrl && !selectedProject.demoUrl && !selectedProject.readmeUrl}
												<span class="ht-empty">No links provided</span>
											{/if}
											{#if selectedProject.status === 'unreviewed'}
												<a href="https://hack-club-hq.gitbook.io/ysws-project-submission-guidelines/BLBRN8LIfoCZhFV6oMNR" target="_blank" rel="noopener" class="ht-btn ht-btn-docs">Open Docs</a>
											{/if}
										</div>
									</div>

									{#if selectedProject.screenshot1Url || selectedProject.screenshot2Url}
										<div class="proj-screenshots">
											<div class="proj-screenshot-viewer">
												<img
													src={projScreenIdx === 0 ? (selectedProject.screenshot1Url ?? selectedProject.screenshot2Url) : selectedProject.screenshot2Url}
													alt="Screenshot {projScreenIdx + 1}"
													class="proj-screenshot"
												/>
												{#if selectedProject.screenshot1Url && selectedProject.screenshot2Url}
													<button class="proj-screen-arrow proj-screen-arrow-left" type="button" onclick={() => projScreenIdx = 0} disabled={projScreenIdx === 0}>&#8249;</button>
													<button class="proj-screen-arrow proj-screen-arrow-right" type="button" onclick={() => projScreenIdx = 1} disabled={projScreenIdx === 1}>&#8250;</button>
													<div class="proj-screen-dots">
														<span class="proj-screen-dot" class:active={projScreenIdx === 0}></span>
														<span class="proj-screen-dot" class:active={projScreenIdx === 1}></span>
													</div>
												{/if}
											</div>
										</div>
									{/if}
								</div>

								{#if selectedProject.hackatimeProjectName?.length > 0}
									<div class="proj-info-row">
										<span class="proj-info-label">Hackatime Projects:</span>
										<span class="proj-info-value">{selectedProject.hackatimeProjectName.join(', ')}</span>
									</div>
								{/if}
								{#if selectedProject.otherHcProgram}
									<div class="proj-info-row">
										<span class="proj-info-label">Other HC Program:</span>
										<span class="proj-info-value">{selectedProject.otherHcProgram}</span>
									</div>
								{/if}
								{#if selectedProject.aiUse}
									<div class="proj-info-row">
										<span class="proj-info-label">AI Usage:</span>
										<span class="proj-info-value">{selectedProject.aiUse}</span>
									</div>
								{/if}

								{#if selectedProject.latestSubmission?.changeDescription}
									<div class="proj-info-row">
										<span class="proj-info-label">Resubmission Notes:</span>
										<span class="proj-info-value" style="white-space: pre-wrap">{selectedProject.latestSubmission.changeDescription}</span>
									</div>
									{#if selectedProject.latestSubmission.minHoursConfirmed}
										<div class="proj-info-row">
											<span class="proj-info-label">Min Hours:</span>
											<span class="proj-info-value">Confirmed 3+ hours since last ship</span>
										</div>
									{/if}
								{/if}

								{#if selectedProject.status === 'unreviewed'}
									<hr class="proj-divider" />

									{#if hackatimeLoading}
										<span class="ht-loading">Loading Hackatime data...</span>
									{:else if hackatimeData}
										<div class="ht-detail">
											<div class="ht-header">
												<span class="ht-trust">Trust Level: <strong class="trust-{hackatimeData.trustLevel ?? 'unknown'}">{{ blue: 'standard', yellow: 'warned', red: 'banned' }[hackatimeData.trustLevel?.toLowerCase() ?? ''] ?? hackatimeData.trustLevel ?? 'unknown'}</strong></span>
												<span class="ht-total">{hackatimeData.totalHours}h total</span>
												{#if hackatimeData.earliestHeartbeat}
													<span class="ht-earliest">first heartbeat: {new Date(hackatimeData.earliestHeartbeat * 1000).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })}</span>
												{/if}
												{#if hackatimeData.previousApprovedHours > 0}
													<span class="ht-delta">prev: {hackatimeData.previousApprovedHours}h — delta: {Math.round((hackatimeData.totalHours - hackatimeData.previousApprovedHours) * 10) / 10}h</span>
												{/if}
											</div>
											{#if hackatimeData.hackatimeProjects.length > 0}
												<div class="ht-projects">
													{#each hackatimeData.hackatimeProjects as hp}
														<div class="ht-project">
															<span class="ht-project-name">{hp.name}</span>
															<span class="ht-project-hours">{hp.hours}h</span>
															{#if hp.languages.length > 0}
																<span class="ht-project-langs">{hp.languages.join(', ')}</span>
															{/if}
														</div>
													{/each}
												</div>
											{:else}
												<span class="ht-empty">No linked Hackatime projects found</span>
											{/if}
											{#if hackatimeData?.unifiedDuplicate}
												<div class="unified-duplicate-alert">Duplicate Found — This code URL already exists in Unified Approved Projects</div>
											{:else if hackatimeData?.unifiedError}
												<div class="unified-error-alert">Unified check failed — could not verify code URL against Approved Projects</div>
											{/if}
											<label class="ht-justification-label">
												Override Justification:
												<textarea class="ht-justification" bind:value={overrideJustification} rows="6"></textarea>
											</label>
										</div>
									{/if}

									<div class="hours-adjust">
										<span class="hours-adjust-label">Internal:</span>
										<button class="hours-btn" onclick={() => adjustHours(0.5)}>Halve</button>
										<button class="hours-btn" onclick={() => adjustHours(1/3)}>Third</button>
										<button class="hours-btn" onclick={() => adjustHours(0.25)}>Quarter</button>
										<div class="hours-custom">
											<button class="hours-tick" onclick={() => { customHours = Math.max(0, Math.round((customHours - 1) * 10) / 10); applyCustomHours(); }}>-</button>
											<input type="number" class="hours-input" bind:value={customHours} onchange={applyCustomHours} min="0" step="0.1" />
											<button class="hours-tick" onclick={() => { customHours = Math.round((customHours + 1) * 10) / 10; applyCustomHours(); }}>+</button>
										</div>
										<span class="hours-adjust-divider">|</span>
										<span class="hours-adjust-label">User Facing:</span>
										<button class="hours-btn" onclick={() => { userFacingHours = Math.round(userFacingHours * 0.5 * 10) / 10; }}>Halve</button>
										<button class="hours-btn" onclick={() => { userFacingHours = Math.round(userFacingHours * (1/3) * 10) / 10; }}>Third</button>
										<button class="hours-btn" onclick={() => { userFacingHours = Math.round(userFacingHours * 0.25 * 10) / 10; }}>Quarter</button>
										<div class="hours-custom">
											<button class="hours-tick" onclick={() => { userFacingHours = Math.max(0, Math.round((userFacingHours - 1) * 10) / 10); }}>-</button>
											<input type="number" class="hours-input" bind:value={userFacingHours} min="0" step="0.1" />
											<button class="hours-tick" onclick={() => { userFacingHours = Math.round((userFacingHours + 1) * 10) / 10; }}>+</button>
										</div>
									</div>

									<hr class="proj-divider" />

									<div class="user-feedback-box">
										<label class="user-feedback-label">
											User Feedback:
											<textarea class="user-feedback" bind:value={userFeedback} rows="4" placeholder="Feedback to send to the user about their project..."></textarea>
										</label>
									</div>

									<div class="user-feedback-box">
										<label class="user-feedback-label">
											Internal Note:
											<textarea class="user-feedback" bind:value={internalNote} rows="3" placeholder="Private note for reviewers only — not visible to the user..."></textarea>
										</label>
									</div>

									<div class="review-actions">
										<button class="review-btn review-btn-approve" onclick={() => reviewProject('approved')} disabled={reviewSubmitting}>Approve</button>
										<button class="review-btn review-btn-reject" onclick={() => reviewProject('changes_needed')} disabled={reviewSubmitting || !userFeedback.trim()}>Reject</button>
										<button class="review-btn review-btn-ban" onclick={() => { if (confirm('Ban this user and reject their project?')) reviewProject('ban'); }} disabled={reviewSubmitting}>Fail &amp; Ban</button>
									</div>
								{/if}

								{#if pastReviews.length > 0}
									<hr class="proj-divider" />
									<h4 class="reviews-heading">Review History</h4>
									{#each pastReviews as review}
										<div class="review-card review-card-{review.status}">
											<div class="review-card-header">
												<span class="badge badge-{review.status} badge-sm">{review.status}</span>
												<span class="review-card-reviewer">{review.reviewerName ?? 'Unknown'}</span>
												<span class="review-card-date">{formatDate(review.createdAt)}</span>
											</div>
											{#if review.feedback}
												<div class="review-card-section">
													<span class="review-card-label">Feedback:</span>
													<p class="review-card-text">{review.feedback}</p>
												</div>
											{/if}
											{#if review.internalNote}
												<div class="review-card-section review-card-internal">
													<span class="review-card-label">Internal Note:</span>
													<p class="review-card-text">{review.internalNote}</p>
												</div>
											{/if}
											{#if review.overrideJustification}
												<div class="review-card-section">
													<span class="review-card-label">Justification:</span>
													<p class="review-card-text">{review.overrideJustification}</p>
												</div>
											{/if}
										</div>
									{/each}
								{/if}
							{:else}
								<div class="proj-main-empty">
									<p>Select a project to review</p>
								</div>
							{/if}
						</div>
					</div>
				{/if}
			</div>
		{/if}
	</main>
</div>

<style>
	.admin-shell {
		min-height: 100vh;
		background: #1a1a1a;
		color: #e0e0e0;
		font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
		font-size: 13px;
	}

	.admin-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 0.6rem 1.5rem;
		background: #111;
		border-bottom: 1px solid #333;
	}

	.admin-header h1 {
		font-size: 1.25rem;
		font-weight: 600;
		margin: 0;
	}

	.admin-user {
		font-size: 0.85rem;
		color: #888;
	}

	.admin-tabs {
		display: flex;
		gap: 0;
		background: #111;
		border-bottom: 1px solid #333;
		padding: 0 2rem;
	}

	.tab {
		padding: 0.4rem 0.75rem;
		background: none;
		border: none;
		color: #888;
		cursor: pointer;
		font-size: 0.9rem;
		border-bottom: 2px solid transparent;
		transition: color 0.15s, border-color 0.15s;
	}

	.tab:hover { color: #ccc; }
	.tab.active { color: #fff; border-bottom-color: #5b9bd5; }

	.tab-home {
		margin-left: auto;
		text-decoration: none;
	}

	.admin-content {
		padding: 1rem 1.5rem;
	}

	.users-layout {
		display: flex;
		gap: 1.5rem;
	}

	.users-table-wrap {
		flex: 1;
		min-width: 0;
		overflow-x: auto;
	}

	.stat-cards {
		display: flex;
		gap: 0.75rem;
		margin-bottom: 1rem;
	}

	.stat-card {
		display: flex;
		flex-direction: column;
		padding: 1rem 1.5rem;
		background: #1e1e1e;
		border: 2px solid #444;
		border-radius: 8px;
		min-width: 140px;
	}

	.stat-value {
		font-size: 1.75rem;
		font-weight: 700;
		color: #e0e0e0;
		line-height: 1;
	}

	.stat-label {
		font-size: 0.8rem;
		color: #888;
		margin-top: 0.25rem;
	}

	.users-toolbar {
		display: flex;
		gap: 0.5rem;
		margin-bottom: 0.75rem;
	}

	.users-search {
		flex: 1;
		background: #1e1e1e;
		border: 2px solid #666;
		border-radius: 6px;
		color: #e0e0e0;
		padding: 0.5rem 0.75rem;
		font-size: 0.85rem;
		font-family: inherit;
	}

	.users-search:focus {
		outline: none;
		border-color: #5b9bd5;
	}

	.users-perms-filter {
		background: #1a1a1a;
		border: 1px solid #444;
		border-radius: 6px;
		color: #e0e0e0;
		padding: 0.5rem 0.75rem;
		font-size: 0.85rem;
		font-family: inherit;
		cursor: pointer;
	}

	.users-perms-filter:focus {
		outline: none;
		border-color: #5b9bd5;
	}

	.type-filter-select {
		background: #1e1e1e;
		border: 2px solid #666;
		border-radius: 6px;
		color: #e0e0e0;
		padding: 0.5rem 0.75rem;
		font-size: 0.85rem;
		font-family: inherit;
		cursor: pointer;
	}

	.type-filter-select:focus {
		outline: none;
		border-color: #5b9bd5;
	}

	.users-layout.has-detail .users-table-wrap {
		flex: 0 0 45%;
	}

	.users-table, .mini-table {
		width: 100%;
		border-collapse: collapse;
		font-size: 0.85rem;
	}

	.users-table th, .users-table td,
	.mini-table th, .mini-table td {
		padding: 0.5rem 0.75rem;
		text-align: left;
		border-bottom: 1px solid #2a2a2a;
	}

	.users-table th, .mini-table th {
		color: #888;
		font-weight: 500;
		font-size: 0.75rem;
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}

	.users-table tbody tr {
		cursor: pointer;
		transition: background 0.1s;
	}

	.users-table tbody tr:hover { background: #252525; }
	.users-table tbody tr.selected { background: #1e2a3a; }

	.mono { font-family: 'SF Mono', 'Fira Code', monospace; font-size: 0.8rem; }

	.detail-panel {
		flex: 0 0 50%;
		background: #222;
		border: 1px solid #333;
		border-radius: 8px;
		overflow-y: auto;
		max-height: calc(100vh - 160px);
	}

	.detail-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 1rem 1.25rem;
		border-bottom: 1px solid #333;
		position: sticky;
		top: 0;
		background: #222;
	}

	.detail-header h2 {
		margin: 0;
		font-size: 1.1rem;
	}

	.close-btn {
		background: none;
		border: none;
		color: #888;
		font-size: 1.5rem;
		cursor: pointer;
		padding: 0 0.25rem;
		line-height: 1;
	}

	.close-btn:hover { color: #fff; }

	.detail-sections {
		padding: 1rem 1.25rem;
		display: flex;
		flex-direction: column;
		gap: 1.25rem;
	}

	.scrollable-table {
		max-height: 300px;
		overflow-y: auto;
	}

	.scrollable-table thead {
		position: sticky;
		top: 0;
		background: #222;
		z-index: 1;
	}

	.detail-section h3 {
		font-size: 0.8rem;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: #888;
		margin: 0 0 0.75rem 0;
	}

	dl {
		display: grid;
		grid-template-columns: auto 1fr;
		gap: 0.35rem 1rem;
		margin: 0;
		font-size: 0.85rem;
	}

	dt { color: #888; }
	dd { margin: 0; }

	.badge {
		display: inline-block;
		padding: 0.15rem 0.5rem;
		border-radius: 4px;
		font-size: 0.75rem;
		font-weight: 500;
		background: #2a3a2a;
		color: #8bc48b;
	}

	.badge.banned { background: #3a2020; color: #e05555; }
	.badge-approved { background: #1e2a3a; color: #5b9bd5; }
	.badge-unreviewed { background: #3a3520; color: #d5b85b; }
	.badge-changes_needed { background: #3a2520; color: #d58b5b; }
	.badge-unshipped { background: #2a2a2a; color: #888; }

	.actions {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
	}

	.btn {
		padding: 0.5rem 1rem;
		border: 1px solid #444;
		border-radius: 6px;
		cursor: pointer;
		font-size: 0.8rem;
		font-weight: 500;
		transition: background 0.15s, border-color 0.15s;
	}

	.btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}



	.btn-promote {
		background: #1e2a3a;
		color: #5b9bd5;
		border-color: #2a3a5a;
	}

	.btn-promote:hover:not(:disabled) { background: #253550; }

	.btn-ban {
		background: #2a1515;
		color: #e05555;
		border-color: #4a2020;
	}

	.btn-ban:hover:not(:disabled) { background: #3a1a1a; }

	.btn-impersonate {
		background: #1a1a2a;
		color: #55a0e0;
		border-color: #20204a;
	}
	.btn-impersonate:hover:not(:disabled) { background: #1a1a3a; }

	.perms-action { position: relative; }

	.perms-dropdown {
		position: absolute;
		top: 100%;
		left: 0;
		margin-top: 0.25rem;
		background: #2a2a2a;
		border: 1px solid #444;
		border-radius: 6px;
		overflow: hidden;
		z-index: 10;
		min-width: 160px;
	}

	.perms-option {
		display: block;
		width: 100%;
		padding: 0.5rem 1rem;
		background: none;
		border: none;
		color: #e0e0e0;
		text-align: left;
		cursor: pointer;
		font-size: 0.8rem;
	}

	.perms-option:hover:not(:disabled) { background: #333; }
	.perms-option.current { color: #5b9bd5; font-weight: 600; }
	.perms-option:disabled { opacity: 0.4; cursor: not-allowed; }

	.loading, .empty, .placeholder {
		color: #888;
		text-align: center;
		padding: 2rem;
	}

	/* News admin styles */
	.news-admin {
		max-width: 900px;
	}

	.news-form {
		background: #222;
		border: 1px solid #333;
		border-radius: 8px;
		padding: 1.25rem;
		margin-bottom: 1.5rem;
	}

	.news-form h3 {
		font-size: 0.8rem;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: #888;
		margin: 0 0 0.75rem 0;
	}

	.news-form-fields {
		display: grid;
		grid-template-columns: auto 1fr auto;
		gap: 0.5rem;
		align-items: start;
	}

	.news-date-row {
		display: flex;
		gap: 0.35rem;
		align-items: center;
	}

	.btn-now {
		background: #2a2a2a;
		color: #ccc;
		border-color: #444;
		white-space: nowrap;
	}

	.btn-now:hover:not(:disabled) { background: #333; }

	.news-input, .news-edit-input {
		background: #1a1a1a;
		border: 1px solid #444;
		border-radius: 4px;
		color: #e0e0e0;
		padding: 0.5rem;
		font-size: 0.85rem;
		font-family: inherit;
	}

	.news-input:focus, .news-edit-input:focus {
		outline: none;
		border-color: #5b9bd5;
	}

	.news-input-text {
		resize: vertical;
	}

	.news-edit-text {
		width: 100%;
		resize: vertical;
	}

	.news-actions {
		display: flex;
		gap: 0.35rem;
		white-space: nowrap;
	}

	.btn-add-news {
		background: #1e3a1e;
		color: #8bc48b;
		border-color: #2a5a2a;
		align-self: start;
	}

	.btn-add-news:hover:not(:disabled) { background: #255025; }

	.btn-edit {
		background: #1e2a3a;
		color: #5b9bd5;
		border-color: #2a3a5a;
	}

	.btn-edit:hover:not(:disabled) { background: #253550; }

	.btn-delete {
		background: #2a1515;
		color: #e05555;
		border-color: #4a2020;
	}

	.btn-delete:hover:not(:disabled) { background: #3a1a1a; }

	.btn-save {
		background: #1e3a1e;
		color: #8bc48b;
		border-color: #2a5a2a;
	}

	.btn-save:hover:not(:disabled) { background: #255025; }

	.btn-cancel {
		background: #2a2a2a;
		color: #888;
		border-color: #444;
	}

	.btn-cancel:hover:not(:disabled) { background: #333; }

	/* Projects tab */
	.projects-admin {
		max-width: 1600px;
		margin: 0 auto;
	}

	.status-pills {
		display: flex;
		gap: 0.5rem;
		margin-bottom: 1rem;
		flex-wrap: wrap;
	}

	.pill {
		display: inline-flex;
		align-items: center;
		gap: 0.4rem;
		padding: 0.4rem 0.9rem;
		border-radius: 20px;
		border: 2px solid #777;
		background: #2a2a2a;
		color: #ccc;
		font-size: 0.8rem;
		font-weight: 500;
		cursor: pointer;
		transition: background 0.15s, border-color 0.15s, color 0.15s;
	}

	.pill:hover { background: #383838; color: #eee; }

	.pill.active { color: #fff; }

	.pill-count {
		background: #444;
		padding: 0.1rem 0.45rem;
		border-radius: 10px;
		font-size: 0.7rem;
		font-weight: 600;
		color: #ddd;
	}

	.pill.active .pill-count { background: rgba(255,255,255,0.15); }

	.pill-unshipped { background: #c48382; border-color: #e09a99; color: #fff; }
	.pill-unshipped.active { background: #d4908f; border-color: #f0b0af; }

	.pill-unreviewed { background: #b5a88e; border-color: #cbc1ae; color: #fff; }
	.pill-unreviewed.active { background: #cbc1ae; border-color: #e0d8c8; }

	.pill-changes_needed { background: #d4a55a; border-color: #e6ba70; color: #fff; }
	.pill-changes_needed.active { background: #e0b468; border-color: #f0ca80; }

	.pill-approved { background: #93b4cd; border-color: #aaccdd; color: #fff; }
	.pill-approved.active { background: #a8c6dd; border-color: #c0ddef; }

	.proj-split {
		display: flex;
		gap: 2px;
		background: #777;
		border: 2px solid #777;
		border-radius: 8px;
		overflow: hidden;
		min-height: 300px;
	}

	.proj-sidebar {
		width: 280px;
		flex-shrink: 0;
		background: #1e1e1e;
	}

	.proj-sidebar-item {
		display: flex;
		flex-direction: column;
		gap: 0.15rem;
		width: 100%;
		padding: 0.3rem 0.7rem;
		border: none;
		border-bottom: 1px solid #333;
		background: transparent;
		color: #ccc;
		text-align: left;
		cursor: pointer;
		font-family: inherit;
		font-size: 0.8rem;
		transition: background 0.1s;
	}

	.proj-sidebar-item:hover {
		background: #2a2a2a;
	}

	.proj-sidebar-item.active {
		background: transparent;
	}

	.proj-sidebar-item.active .proj-sidebar-name {
		text-decoration: underline;
		text-decoration-color: #5b9bd5;
		text-underline-offset: 3px;
	}

	.proj-sidebar-name {
		font-weight: 600;
		color: #e0e0e0;
		font-size: 0.85rem;
	}

	.proj-sidebar-meta {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		color: #888;
		font-size: 0.75rem;
	}

	.badge-sm {
		font-size: 0.65rem;
		padding: 0.1rem 0.35rem;
	}

	.ht-pill {
		display: inline-block;
		margin-left: 0.35rem;
		font-size: 0.6rem;
		font-weight: 700;
		padding: 0.05rem 0.3rem;
		border-radius: 3px;
		background: rgba(91, 155, 213, 0.2);
		color: #5b9bd5;
		border: 1px solid rgba(91, 155, 213, 0.5);
		vertical-align: middle;
	}

	.admin-shell.light .ht-pill {
		background: rgba(42, 102, 153, 0.12);
		color: #2a6699;
		border-color: rgba(42, 102, 153, 0.4);
	}

	.proj-main {
		flex: 1;
		min-width: 0;
		background: #252525;
		padding: 0.85rem 1.1rem;
	}

	.proj-main-empty {
		display: flex;
		align-items: center;
		justify-content: center;
		height: 100%;
		color: #666;
		font-size: 0.9rem;
	}

	.proj-main-header {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		margin-bottom: 0.5rem;
	}

	.proj-main-title {
		margin: 0;
		font-size: 1.2rem;
		color: #fff;
	}

	.proj-main-desc {
		color: #bbb;
		font-size: 0.85rem;
		line-height: 1.5;
		margin: 0 0 1rem;
	}

	.proj-main-meta {
		display: flex;
		flex-wrap: wrap;
		gap: 1rem;
		font-size: 0.8rem;
		color: #999;
		margin-bottom: 1rem;
	}

	.proj-main-meta strong {
		color: #e0e0e0;
	}

	.proj-top-row {
		display: flex;
		gap: 1rem;
		align-items: flex-start;
	}

	.proj-top-info {
		flex: 1;
		min-width: 0;
	}

	.proj-screenshots {
		flex-shrink: 0;
	}

	.proj-screenshot-viewer {
		position: relative;
		display: inline-block;
	}

	.proj-screenshot {
		max-width: 320px;
		max-height: 220px;
		border: 2px solid #555;
		border-radius: 6px;
		object-fit: cover;
		display: block;
	}

	.proj-screen-arrow {
		position: absolute;
		top: 50%;
		transform: translateY(-50%);
		background: rgba(0, 0, 0, 0.55);
		border: none;
		color: #eee;
		font-size: 20px;
		width: 26px;
		height: 34px;
		cursor: pointer;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 0;
		opacity: 0;
		transition: opacity 150ms;
	}

	.proj-screenshot-viewer:hover .proj-screen-arrow {
		opacity: 1;
	}

	.proj-screen-arrow:disabled {
		opacity: 0 !important;
		cursor: default;
	}

	.proj-screen-arrow-left {
		left: 0;
		border-radius: 0 4px 4px 0;
	}

	.proj-screen-arrow-right {
		right: 0;
		border-radius: 4px 0 0 4px;
	}

	.proj-screen-dots {
		position: absolute;
		bottom: 8px;
		left: 50%;
		transform: translateX(-50%);
		display: flex;
		gap: 5px;
	}

	.proj-screen-dot {
		width: 6px;
		height: 6px;
		border-radius: 50%;
		background: rgba(255, 255, 255, 0.35);
	}

	.proj-screen-dot.active {
		background: #fff;
	}

	.proj-info-row {
		display: flex;
		gap: 0.5rem;
		align-items: baseline;
		font-size: 0.85rem;
		margin-bottom: 0.4rem;
	}

	.proj-info-label {
		color: #999;
		flex-shrink: 0;
	}

	.proj-info-value {
		color: #e0e0e0;
	}

	.proj-divider {
		border: none;
		border-top: 2px solid #666;
		margin: 1rem 0;
	}

	.ht-actions {
		display: flex;
		gap: 0.5rem;
		margin-bottom: 0.25rem;
	}

	.ht-btn {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		padding: 0.5rem 1.5rem;
		border-radius: 6px;
		font-size: 0.85rem;
		font-weight: 600;
		font-family: inherit;
		text-decoration: none;
		cursor: pointer;
		transition: opacity 0.15s;
	}

	.ht-btn:hover {
		opacity: 0.85;
	}

	.ht-btn-github {
		background: #7b5ea7;
		color: #fff;
		border: 2px solid #a080d0;
	}

	.ht-btn-demo {
		background: #5b9bd5;
		color: #fff;
		border: 2px solid #8fc4ef;
	}

	.ht-btn-readme {
		background: #4a9a5a;
		color: #fff;
		border: 2px solid #6abf7a;
	}

	.ht-btn-docs {
		background: #fff;
		color: #111;
		border: 2px solid #ddd;
	}

	.user-feedback-box {
		margin-top: 0.25rem;
	}

	.user-feedback-label {
		display: flex;
		flex-direction: column;
		gap: 0.35rem;
		font-size: 0.8rem;
		color: #aaa;
	}

	.user-feedback {
		background: #1e1e1e;
		border: 2px solid #777;
		border-radius: 6px;
		color: #e0e0e0;
		padding: 0.5rem 0.75rem;
		font-size: 0.85rem;
		font-family: inherit;
		resize: vertical;
	}

	.user-feedback:focus {
		outline: none;
		border-color: #5b9bd5;
	}

	.hours-adjust {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.5rem 0.5rem;
		margin-top: 0.5rem;
	}

	.hours-adjust-label {
		font-size: 0.8rem;
		color: #aaa;
		white-space: nowrap;
	}

	.hours-adjust-divider {
		color: #555;
		font-size: 1rem;
		margin: 0 0.25rem;
	}

	.hours-btn {
		height: 30px;
		padding: 0 0.85rem;
		border: 2px solid #777;
		border-radius: 6px;
		background: #333;
		color: #e0e0e0;
		font-size: 0.8rem;
		font-weight: 600;
		font-family: inherit;
		cursor: pointer;
		transition: background 0.15s;
	}

	.hours-btn:hover {
		background: #444;
	}

	.hours-custom {
		display: flex;
		align-items: center;
		gap: 0;
		margin-left: 0.5rem;
	}

	.hours-tick {
		width: 30px;
		height: 30px;
		border: 2px solid #777;
		background: #333;
		color: #e0e0e0;
		font-size: 1rem;
		font-weight: 700;
		cursor: pointer;
		display: flex;
		align-items: center;
		justify-content: center;
		font-family: inherit;
	}

	.hours-tick:first-child {
		border-radius: 6px 0 0 6px;
		border-right: none;
	}

	.hours-tick:last-child {
		border-radius: 0 6px 6px 0;
		border-left: none;
	}

	.hours-tick:hover {
		background: #444;
	}

	.hours-input {
		width: 55px;
		height: 30px;
		border: 2px solid #777;
		border-left: none;
		border-right: none;
		background: #1e1e1e;
		color: #e0e0e0;
		font-size: 0.85rem;
		font-family: inherit;
		text-align: center;
		appearance: textfield;
		-moz-appearance: textfield;
	}

	.hours-input::-webkit-inner-spin-button,
	.hours-input::-webkit-outer-spin-button {
		-webkit-appearance: none;
		margin: 0;
	}

	.hours-input:focus {
		outline: none;
		border-color: #5b9bd5;
	}


	.review-actions {
		display: flex;
		flex-wrap: wrap;
		gap: 0.75rem;
		margin-top: 1rem;
	}

	.review-btn {
		flex: 1 1 140px;
		min-width: 0;
		padding: 0.75rem 1rem;
		border: none;
		border-radius: 8px;
		font-size: 1rem;
		font-weight: 700;
		font-family: inherit;
		cursor: pointer;
		transition: opacity 0.15s;
		color: #fff;
	}

	.review-btn:hover {
		opacity: 0.85;
	}

	.review-btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.review-btn-approve {
		background: #4a9a5a;
	}

	.review-btn-reject {
		background: #c44040;
	}

	.review-btn-ban {
		background: #1a1a1a;
		border: 2px solid #c44040;
		color: #c44040;
	}

	.reviews-heading {
		margin: 0 0 0.5rem;
		font-size: 0.9rem;
		color: #ccc;
	}

	.review-card {
		border: 1px solid #444;
		border-radius: 6px;
		padding: 0.6rem 0.8rem;
		margin-bottom: 0.5rem;
		background: #1e1e1e;
	}

	.review-card-approved { border-left: 3px solid #4a9a5a; }
	.review-card-changes_needed { border-left: 3px solid #c44040; }

	.review-card-header {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		margin-bottom: 0.35rem;
		font-size: 0.75rem;
	}

	.review-card-reviewer {
		color: #ccc;
		font-weight: 600;
	}

	.review-card-date {
		color: #777;
		margin-left: auto;
	}

	.review-card-section {
		margin-top: 0.3rem;
	}

	.review-card-label {
		font-size: 0.7rem;
		color: #888;
		text-transform: uppercase;
		letter-spacing: 0.03em;
	}

	.review-card-text {
		margin: 0.15rem 0 0;
		font-size: 0.8rem;
		color: #ccc;
		white-space: pre-wrap;
		line-height: 1.4;
	}

	.review-card-internal {
		background: rgba(212, 165, 90, 0.08);
		border-radius: 4px;
		padding: 0.3rem 0.5rem;
		margin-top: 0.35rem;
	}

	.review-card-internal .review-card-label {
		color: #d4a55a;
	}

	.ht-detail {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}

	.ht-header {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.5rem 1.5rem;
		font-size: 0.85rem;
		color: #ccc;
	}

	.ht-trust strong {
		font-weight: 600;
	}

	.trust-green { color: #4caf50; }
	.trust-blue { color: #5b9bd5; }
	.trust-yellow { color: #ffc107; }
	.trust-red { color: #f44336; }
	.trust-unknown { color: #888; }

	.ht-total {
		color: #5b9bd5;
		font-weight: 600;
	}

	.ht-delta {
		color: #c48382;
		font-weight: 600;
		font-size: 0.85rem;
	}

	.ht-earliest {
		color: #b8a970;
		font-weight: 600;
		font-size: 0.85rem;
	}

	.ht-projects {
		display: flex;
		flex-direction: column;
		gap: 0.35rem;
	}

	.ht-project {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		background: #2a2a2a;
		border: 2px solid #666;
		border-radius: 4px;
		padding: 0.35rem 0.6rem;
		font-size: 0.8rem;
		color: #ddd;
	}

	.ht-project-name {
		font-weight: 600;
		color: #e0e0e0;
	}

	.ht-project-hours {
		color: #5b9bd5;
	}

	.ht-project-langs {
		color: #888;
		font-size: 0.75rem;
	}

	.ht-loading {
		color: #888;
		font-size: 0.85rem;
	}

	.ht-empty {
		color: #666;
		font-size: 0.85rem;
		font-style: italic;
	}

	.unified-duplicate-alert {
		background: rgba(220, 50, 50, 0.15);
		border: 2px solid #c44040;
		border-radius: 6px;
		color: #f44336;
		font-weight: 700;
		font-size: 0.85rem;
		padding: 0.5rem 0.75rem;
		margin-bottom: 0.5rem;
	}

	.unified-error-alert {
		background: rgba(212, 165, 90, 0.15);
		border: 2px solid #d4a55a;
		border-radius: 6px;
		color: #d4a55a;
		font-weight: 700;
		font-size: 0.85rem;
		padding: 0.5rem 0.75rem;
		margin-bottom: 0.5rem;
	}

	.ht-justification-label {
		display: flex;
		flex-direction: column;
		gap: 0.35rem;
		font-size: 0.8rem;
		color: #aaa;
		margin-top: 0.25rem;
	}

	.ht-justification {
		background: #1e1e1e;
		border: 2px solid #777;
		border-radius: 6px;
		color: #e0e0e0;
		padding: 0.5rem 0.75rem;
		font-size: 0.85rem;
		font-family: inherit;
		resize: vertical;
	}

	.ht-justification:focus {
		outline: none;
		border-color: #5b9bd5;
	}

	/* ── Shop Admin ── */
	.shop-admin {
		display: flex;
		flex-direction: column;
		gap: 1.5rem;
	}

	.shop-form {
		background: #2a2a2a;
		border: 2px solid #555;
		border-radius: 8px;
		padding: 1.25rem;
	}

	.shop-form h3 {
		margin: 0 0 1rem;
		color: #e0e0e0;
		font-size: 1rem;
	}

	.shop-form-grid {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.shop-input {
		background: #1e1e1e;
		border: 2px solid #555;
		border-radius: 4px;
		color: #e0e0e0;
		padding: 0.4rem 0.6rem;
		font-size: 0.85rem;
		font-family: inherit;
		width: 100%;
		box-sizing: border-box;
	}

	.shop-input:focus {
		outline: none;
		border-color: #5b9bd5;
	}

	.shop-textarea {
		resize: vertical;
	}

	.shop-input-sm {
		max-width: 140px;
	}

	.shop-form-row {
		display: flex;
		align-items: flex-end;
		gap: 0.75rem;
		flex-wrap: wrap;
	}

	.shop-field {
		display: flex;
		flex-direction: column;
		gap: 0.2rem;
		font-size: 0.8rem;
		color: #aaa;
	}

	.shop-checkbox {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		font-size: 0.85rem;
		color: #ccc;
		cursor: pointer;
	}

	.btn-add-shop {
		margin-left: auto;
		background: #5b9bd5;
		color: #111;
		font-weight: 600;
	}

	.shop-items-list {
		display: flex;
		flex-direction: column;
		gap: 0;
	}

	.shop-item-row {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		padding: 0.6rem 0.75rem;
		background: #2a2a2a;
		border: 2px solid #444;
		border-bottom: none;
		transition: background 120ms ease;
		cursor: grab;
	}

	.shop-item-row:last-child {
		border-bottom: 2px solid #444;
		border-radius: 0 0 6px 6px;
	}

	.shop-item-row:first-child {
		border-radius: 6px 6px 0 0;
	}

	.shop-item-row.dragging {
		opacity: 0.4;
	}

	.shop-item-row.drag-over {
		border-top: 3px solid #5b9bd5;
	}

	.shop-item-row.inactive {
		opacity: 0.5;
	}

	.shop-item-drag-handle {
		font-size: 1.1rem;
		color: #666;
		cursor: grab;
		user-select: none;
		flex-shrink: 0;
		padding: 0 4px;
	}

	.shop-item-drag-handle:active {
		cursor: grabbing;
	}

	.shop-item-preview {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		flex: 1;
		min-width: 0;
	}

	.shop-item-thumb {
		width: 48px;
		height: 48px;
		object-fit: cover;
		border: 1px solid #555;
		border-radius: 4px;
		flex-shrink: 0;
		background: #1a1a1a;
	}

	.shop-item-info {
		display: flex;
		flex-direction: column;
		gap: 0.15rem;
		min-width: 0;
		color: #e0e0e0;
		font-size: 0.85rem;
	}

	.shop-item-info strong {
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.shop-item-meta {
		color: #888;
		font-size: 0.75rem;
	}

	.shop-item-actions {
		display: flex;
		gap: 0.4rem;
		flex-shrink: 0;
	}

	.shop-item-edit {
		flex: 1;
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
	}

	.shop-edit-actions {
		display: flex;
		gap: 0.4rem;
		margin-left: auto;
	}

	/* Theme toggle button */
	.theme-toggle {
		background: #333;
		color: #ccc;
		border: 1px solid #555;
		border-radius: 4px;
		padding: 0.3rem 0.7rem;
		font-size: 0.75rem;
		font-family: inherit;
		cursor: pointer;
		transition: background 0.15s, color 0.15s;
	}
	.theme-toggle:hover { background: #444; color: #fff; }

	/* ── Light Mode ── */
	.admin-shell.light {
		background: #f5f4f1;
		color: #1a1a1a;
	}

	.admin-shell.light .theme-toggle {
		background: #e8e6e1;
		color: #333;
		border-color: #666;
	}
	.admin-shell.light .theme-toggle:hover { background: #ddd; color: #111; }

	.admin-shell.light .admin-header {
		background: #eae8e3;
		border-bottom-color: #666;
	}

	.admin-shell.light .admin-header h1 { color: #1a1a1a; }
	.admin-shell.light .admin-user { color: #555; }

	.admin-shell.light .admin-tabs {
		background: #eae8e3;
		border-bottom-color: #666;
	}

	.admin-shell.light .tab { color: #666; }
	.admin-shell.light .tab:hover { color: #222; }
	.admin-shell.light .tab.active { color: #1a1a1a; border-bottom-color: #3b7bb5; }

	/* Inputs & selects */
	.admin-shell.light .users-search,
	.admin-shell.light .type-filter-select {
		background: #fff;
		border-color: #555;
		color: #1a1a1a;
	}
	.admin-shell.light .users-search:focus,
	.admin-shell.light .type-filter-select:focus {
		border-color: #3b7bb5;
	}

	.admin-shell.light .users-perms-filter {
		background: #f5f4f1;
		border-color: #555;
		color: #1a1a1a;
	}
	.admin-shell.light .users-perms-filter:focus { border-color: #3b7bb5; }

	/* Tables */
	.admin-shell.light .users-table th,
	.admin-shell.light .mini-table th {
		color: #555;
	}

	.admin-shell.light .users-table td,
	.admin-shell.light .mini-table td {
		border-bottom-color: #999;
	}

	.admin-shell.light .users-table th,
	.admin-shell.light .mini-table th {
		border-bottom-color: #666;
	}

	.admin-shell.light .users-table tbody tr:hover { background: #eae8e3; }
	.admin-shell.light .users-table tbody tr.selected { background: #d8e6f3; }

	/* Detail panel */
	.admin-shell.light .detail-panel {
		background: #fff;
		border-color: #666;
	}

	.admin-shell.light .detail-header {
		background: #fff;
		border-bottom-color: #666;
	}

	.admin-shell.light .detail-header h2 { color: #1a1a1a; }
	.admin-shell.light .close-btn { color: #777; }
	.admin-shell.light .close-btn:hover { color: #222; }

	.admin-shell.light .detail-section h3 { color: #555; }
	.admin-shell.light dt { color: #555; }
	.admin-shell.light dd { color: #1a1a1a; }

	/* Badges */
	.admin-shell.light .badge { background: #d4edda; color: #2d6a3f; }
	.admin-shell.light .badge.banned { background: #f5d5d5; color: #c02020; }
	.admin-shell.light .badge-approved { background: #d0e4f5; color: #2a6699; }
	.admin-shell.light .badge-unreviewed { background: #f5ecd0; color: #8a7020; }
	.admin-shell.light .badge-changes_needed { background: #f5dcc8; color: #9a5520; }
	.admin-shell.light .badge-unshipped { background: #e8e6e1; color: #555; }

	/* Buttons */
	.admin-shell.light .btn { border-color: #555; }

	.admin-shell.light .btn-promote { background: #d0e4f5; color: #2a6699; border-color: #5588aa; }
	.admin-shell.light .btn-promote:hover:not(:disabled) { background: #bdd8f0; }

	.admin-shell.light .btn-ban { background: #f5d5d5; color: #c02020; border-color: #aa5050; }
	.admin-shell.light .btn-ban:hover:not(:disabled) { background: #f0c0c0; }

	.admin-shell.light .btn-impersonate { background: #d0dff5; color: #2255a0; border-color: #5577aa; }
	.admin-shell.light .btn-impersonate:hover:not(:disabled) { background: #c0d0f0; }

	/* Perms dropdown */
	.admin-shell.light .perms-dropdown { background: #fff; border-color: #666; }
	.admin-shell.light .perms-option { color: #1a1a1a; }
	.admin-shell.light .perms-option:hover:not(:disabled) { background: #f0efe8; }
	.admin-shell.light .perms-option.current { color: #3b7bb5; }

	.admin-shell.light .loading,
	.admin-shell.light .empty,
	.admin-shell.light .placeholder { color: #777; }

	/* News */
	.admin-shell.light .news-form { background: #fff; border-color: #666; }
	.admin-shell.light .news-form h3 { color: #555; }
	.admin-shell.light .news-input,
	.admin-shell.light .news-edit-input { background: #f5f4f1; border-color: #555; color: #1a1a1a; }
	.admin-shell.light .news-input:focus,
	.admin-shell.light .news-edit-input:focus { border-color: #3b7bb5; }

	.admin-shell.light .btn-now { background: #e8e6e1; color: #333; border-color: #555; }
	.admin-shell.light .btn-now:hover:not(:disabled) { background: #ddd; }
	.admin-shell.light .btn-add-news { background: #d4edda; color: #2d6a3f; border-color: #508850; }
	.admin-shell.light .btn-add-news:hover:not(:disabled) { background: #c0e0c0; }
	.admin-shell.light .btn-edit { background: #d0e4f5; color: #2a6699; border-color: #5588aa; }
	.admin-shell.light .btn-edit:hover:not(:disabled) { background: #bdd8f0; }
	.admin-shell.light .btn-delete { background: #f5d5d5; color: #c02020; border-color: #aa5050; }
	.admin-shell.light .btn-delete:hover:not(:disabled) { background: #f0c0c0; }
	.admin-shell.light .btn-save { background: #d4edda; color: #2d6a3f; border-color: #508850; }
	.admin-shell.light .btn-save:hover:not(:disabled) { background: #c0e0c0; }
	.admin-shell.light .btn-cancel { background: #e8e6e1; color: #555; border-color: #555; }
	.admin-shell.light .btn-cancel:hover:not(:disabled) { background: #ddd; }

	/* Projects tab */
	.admin-shell.light .pill { background: #e8e6e1; border-color: #555; color: #444; }
	.admin-shell.light .pill:hover { background: #ddd; color: #222; }
	.admin-shell.light .pill-count { background: #999; color: #333; }
	.admin-shell.light .pill.active .pill-count { background: rgba(0,0,0,0.2); }

	.admin-shell.light .pill-unshipped { background: #f0c8c7; border-color: #996060; color: #6a2020; }
	.admin-shell.light .pill-unshipped.active { background: #e8b5b4; border-color: #885050; }
	.admin-shell.light .pill-unreviewed { background: #ebe3d0; border-color: #908060; color: #5a4820; }
	.admin-shell.light .pill-unreviewed.active { background: #e0d8c0; border-color: #807050; }
	.admin-shell.light .pill-changes_needed { background: #f5dca0; border-color: #998040; color: #6a4a10; }
	.admin-shell.light .pill-changes_needed.active { background: #f0d490; border-color: #887030; }
	.admin-shell.light .pill-approved { background: #c0d8ee; border-color: #6088aa; color: #1a4a70; }
	.admin-shell.light .pill-approved.active { background: #b0cce8; border-color: #507899; }

	.admin-shell.light .proj-split { background: #666; border-color: #666; }
	.admin-shell.light .proj-sidebar { background: #f5f4f1; }
	.admin-shell.light .proj-sidebar-item { color: #444; border-bottom-color: #999; }
	.admin-shell.light .proj-sidebar-item:hover { background: #eae8e3; }
	.admin-shell.light .proj-sidebar-item.active { background: transparent; }
	.admin-shell.light .proj-sidebar-name { color: #1a1a1a; }
	.admin-shell.light .proj-sidebar-meta { color: #666; }

	.admin-shell.light .proj-main { background: #fff; }
	.admin-shell.light .proj-main-empty { color: #888; }
	.admin-shell.light .proj-main-title { color: #1a1a1a; }
	.admin-shell.light .proj-main-desc { color: #333; }
	.admin-shell.light .proj-main-meta { color: #555; }
	.admin-shell.light .proj-main-meta strong { color: #1a1a1a; }

	.admin-shell.light .proj-divider { border-top-color: #666; }
	.admin-shell.light .proj-screenshot { border-color: #555; }
	.admin-shell.light .proj-info-label { color: #555; }
	.admin-shell.light .proj-info-value { color: #1a1a1a; }

	/* Hackatime detail */
	.admin-shell.light .ht-header { color: #333; }
	.admin-shell.light .ht-total { color: #2a6699; }
	.admin-shell.light .ht-project { background: #f5f4f1; border-color: #555; color: #333; }
	.admin-shell.light .ht-project-name { color: #1a1a1a; }
	.admin-shell.light .ht-project-hours { color: #2a6699; }
	.admin-shell.light .ht-project-langs { color: #666; }
	.admin-shell.light .ht-loading { color: #777; }
	.admin-shell.light .ht-empty { color: #888; }

	/* Feedback / justification textareas */
	.admin-shell.light .user-feedback,
	.admin-shell.light .ht-justification {
		background: #f5f4f1;
		border-color: #555;
		color: #1a1a1a;
	}
	.admin-shell.light .user-feedback:focus,
	.admin-shell.light .ht-justification:focus { border-color: #3b7bb5; }
	.admin-shell.light .user-feedback-label,
	.admin-shell.light .ht-justification-label { color: #555; }

	/* Hours adjust */
	.admin-shell.light .hours-adjust-label { color: #555; }
	.admin-shell.light .hours-btn { background: #e8e6e1; border-color: #555; color: #1a1a1a; }
	.admin-shell.light .hours-btn:hover { background: #ddd; }
	.admin-shell.light .hours-tick { background: #e8e6e1; border-color: #555; color: #1a1a1a; }
	.admin-shell.light .hours-tick:hover { background: #ddd; }
	.admin-shell.light .hours-input { background: #fff; border-color: #555; color: #1a1a1a; }
	.admin-shell.light .hours-input:focus { border-color: #3b7bb5; }

	/* Review buttons */
	.admin-shell.light .review-btn-approve { background: #3a8a4a; }
	.admin-shell.light .review-btn-reject { background: #b83030; }
	.admin-shell.light .review-btn-ban { background: #fff; border-color: #b83030; color: #b83030; }

	/* Review cards */
	.admin-shell.light .reviews-heading { color: #333; }
	.admin-shell.light .review-card { background: #f5f4f1; border-color: #666; }
	.admin-shell.light .review-card-reviewer { color: #222; }
	.admin-shell.light .review-card-date { color: #777; }
	.admin-shell.light .review-card-label { color: #666; }
	.admin-shell.light .review-card-text { color: #333; }
	.admin-shell.light .review-card-internal { background: rgba(180, 140, 50, 0.08); }

	/* Alerts */
	.admin-shell.light .unified-duplicate-alert { background: rgba(220, 50, 50, 0.08); }
	.admin-shell.light .unified-error-alert { background: rgba(180, 140, 50, 0.08); }

	/* Shop */
	.admin-shell.light .shop-form { background: #fff; border-color: #666; }
	.admin-shell.light .shop-form h3 { color: #1a1a1a; }
	.admin-shell.light .shop-input { background: #f5f4f1; border-color: #555; color: #1a1a1a; }
	.admin-shell.light .shop-input:focus { border-color: #3b7bb5; }
	.admin-shell.light .shop-checkbox { color: #333; }
	.admin-shell.light .btn-add-shop { background: #3b7bb5; color: #fff; }
	.admin-shell.light .shop-item-row { background: #fff; border-color: #666; }
	.admin-shell.light .shop-item-row.drag-over { border-top-color: #3b7bb5; }
	.admin-shell.light .shop-item-drag-handle { color: #666; }
	.admin-shell.light .shop-item-thumb { border-color: #555; background: #f5f4f1; }
	.admin-shell.light .shop-item-info { color: #1a1a1a; }
	.admin-shell.light .shop-item-meta { color: #666; }
	.admin-shell.light .shop-field { color: #555; }

	/* Links */
	.admin-shell.light .ht-btn-docs { background: #f5f4f1; color: #1a1a1a; border-color: #555; }

	.admin-shell.light .mono { color: #1a1a1a; }

	/* ── Fulfillment ─────────────────────────────────── */
	.fulfillment-admin { padding: 0; }

	.fulfillment-toolbar {
		display: flex;
		gap: 0.5rem;
		margin-bottom: 1rem;
		flex-wrap: wrap;
	}

	.admin-table {
		width: 100%;
		border-collapse: collapse;
		font-size: 0.85rem;
	}

	.admin-table th,
	.admin-table td {
		padding: 0.5rem 0.75rem;
		text-align: left;
		border-bottom: 1px solid rgba(255,255,255,0.08);
	}

	.admin-table th {
		color: #93b4cd;
		font-weight: 600;
		font-size: 0.8rem;
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}

	.admin-table tbody tr:hover { background: rgba(255,255,255,0.03); }
	.admin-table tbody tr.fulfilled { opacity: 0.55; }

	.status-badge {
		display: inline-block;
		padding: 0.15rem 0.5rem;
		border-radius: 4px;
		font-size: 0.75rem;
		font-weight: 600;
		text-transform: uppercase;
	}
	.status-pending { background: rgba(196, 131, 130, 0.25); color: #c48382; }
	.status-fulfilled { background: rgba(147, 180, 205, 0.25); color: #93b4cd; }

	.fulfillment-actions {
		display: flex;
		flex-direction: column;
		gap: 0.35rem;
		min-width: 220px;
	}

	.fulfillment-msg-row {
		display: flex;
		gap: 0.25rem;
	}

	.fulfillment-msg-input {
		flex: 1;
		font-size: 0.8rem;
		padding: 0.25rem 0.5rem;
		background: rgba(0,0,0,0.3);
		border: 1px solid rgba(255,255,255,0.15);
		color: inherit;
		border-radius: 3px;
	}

	.fulfillment-msg-input:focus {
		outline: none;
		border-color: #93b4cd;
	}

	.btn-sm {
		font-size: 0.75rem;
		padding: 0.25rem 0.6rem;
	}

	.btn-primary {
		background: rgba(147, 180, 205, 0.3);
		border-color: #93b4cd;
		color: #e6f4fe;
	}
	.btn-primary:hover { background: rgba(147, 180, 205, 0.5); }

	/* light mode overrides */
	.admin-shell.light .admin-table th { color: #333; }
	.admin-shell.light .admin-table td { border-color: #ddd; }
	.admin-shell.light .admin-table tbody tr:hover { background: rgba(0,0,0,0.03); }
	.admin-shell.light .fulfillment-msg-input { background: #fff; border-color: #ccc; color: #1a1a1a; }
	.admin-shell.light .status-pending { background: rgba(196, 131, 130, 0.15); }
	.admin-shell.light .status-fulfilled { background: rgba(147, 180, 205, 0.15); }
</style>
