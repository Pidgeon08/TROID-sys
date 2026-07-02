from datetime import timedelta

from django.contrib.auth.hashers import check_password, make_password
from django.db.models import Q
from django.utils import timezone
from rest_framework import status
from rest_framework.decorators import api_view
from rest_framework.response import Response

from .models import Barangay, Boat, CleanupRequest, DetectionEvent, Operator, ScheduledBot, ScheduledCleanup, User
from .serializers import (
    BarangaySerializer,
    BoatSerializer,
    CleanupRequestSerializer,
    CreateUserSerializer,
    DetectionEventSerializer,
    LoginSerializer,
    OperatorSerializer,
    ScheduledCleanupSerializer,
    ScheduledBotSerializer,
    UserSerializer,
)


# ─── Auth ─────────────────────────────────────────────────────────────────────

@api_view(['POST'])
def login(request):
    serializer = LoginSerializer(data=request.data)
    if not serializer.is_valid():
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    username = serializer.validated_data['username']
    password = serializer.validated_data['password']

    try:
        user = User.objects.get(username=username)
        if check_password(password, user.password_hash):
            user.last_login = timezone.now()
            user.save()
            response_serializer = UserSerializer(user)
            return Response({
                'user': response_serializer.data,
                'role': user.role,
            }, status=status.HTTP_200_OK)
        else:
            return Response({'error': 'Invalid credentials'}, status=status.HTTP_401_UNAUTHORIZED)
    except User.DoesNotExist:
        return Response({'error': 'Invalid credentials'}, status=status.HTTP_401_UNAUTHORIZED)


@api_view(['POST'])
def logout(request):
    """POST /api/logout/ — User signs out, clearing last_login."""
    user_id = request.data.get('user_id')
    if user_id:
        try:
            user = User.objects.get(user_id=user_id)
            user.last_login = None
            user.save()
        except User.DoesNotExist:
            pass
    return Response({'status': 'Logged out'})


# ─── Boats / Detection ────────────────────────────────────────────────────────

@api_view(['POST'])
def log_detection(request):
    """
    Endpoint for the edge devices (boats) to log a trash detection event.
    Expected JSON: {"boat_id": 1, "latitude": 40.71, "longitude": -74.00, "trash_count": 2}
    """
    boat_id = request.data.get('boat_id')
    lat = request.data.get('latitude')
    lng = request.data.get('longitude')
    count = request.data.get('trash_count', 1)

    if not all([boat_id, lat, lng]):
        return Response({"error": "Missing required fields"}, status=status.HTTP_400_BAD_REQUEST)

    try:
        boat = Boat.objects.get(id=boat_id)
        boat.last_latitude = lat
        boat.last_longitude = lng
        boat.save()

        DetectionEvent.objects.create(
            boat=boat,
            latitude=lat,
            longitude=lng,
            trash_count=count,
        )
        return Response({"status": "Detection logged successfully"}, status=status.HTTP_201_CREATED)
    except Boat.DoesNotExist:
        return Response({"error": "Boat not found"}, status=status.HTTP_404_NOT_FOUND)


@api_view(['GET'])
def get_heatmap_data(request):
    """
    Endpoint for the React frontend to fetch heatmap points.
    Returns: [[lat, lng, weight], ...]
    """
    detections = DetectionEvent.objects.all()
    data = []
    for d in detections:
        weight = min(d.trash_count * 0.2, 1.0)
        data.append([d.latitude, d.longitude, weight])

    return Response(data)


@api_view(['GET'])
def boats_list(request):
    """GET /api/boats/ — List all boats with their operators."""
    boats = Boat.objects.all().order_by('id')
    serializer = BoatSerializer(boats, many=True)
    return Response(serializer.data)


@api_view(['GET'])
def operators_list(request):
    """GET /api/operators/ — List all operators."""
    operators = Operator.objects.all().order_by('name')
    serializer = OperatorSerializer(operators, many=True)
    return Response(serializer.data)


# ─── Users ────────────────────────────────────────────────────────────────────

@api_view(['GET', 'POST'])
def users_list(request):
    """
    GET  /api/users/  — List all users (supports ?role=, ?status=, ?search= filters)
    POST /api/users/  — Create a new user
    """
    if request.method == 'GET':
        users = User.objects.all().order_by('-created_at')

        role = request.query_params.get('role', '')
        status_filter = request.query_params.get('status', '')
        search = request.query_params.get('search', '')

        if role:
            users = users.filter(role=role)

        if status_filter == 'active':
            users = users.filter(is_active=True)
        elif status_filter == 'inactive':
            users = users.filter(is_active=False)

        if search:
            users = users.filter(
                Q(full_name__icontains=search) |
                Q(email__icontains=search) |
                Q(username__icontains=search)
            )

        serializer = UserSerializer(users, many=True)
        return Response(serializer.data)

    elif request.method == 'POST':
        serializer = CreateUserSerializer(data=request.data)
        if serializer.is_valid():
            user = serializer.save()
            return Response(UserSerializer(user).data, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


@api_view(['GET'])
def user_stats(request):
    """
    GET /api/users/stats/ — Aggregate counts for the stats cards.
    """
    total = User.objects.count()
    archived = User.objects.filter(is_active=False).count()
    active = User.objects.filter(is_active=True).count()
    signed_in = User.objects.filter(is_active=True).filter(
        last_login__gte=timezone.now() - timedelta(minutes=5)
    ).count()
    admins = User.objects.filter(role='admin').count()

    return Response({
        'total': total,
        'active': active,
        'inactive': archived,
        'signed_in': signed_in,
        'admins': admins,
    })


@api_view(['GET', 'PATCH', 'DELETE'])
def user_detail(request, user_id):
    """
    GET    /api/users/<user_id>/  — Retrieve a single user
    PATCH  /api/users/<user_id>/  — Partially update a user (role, is_active, etc.)
    DELETE /api/users/<user_id>/  — Delete a user
    """
    try:
        user = User.objects.get(user_id=user_id)
    except User.DoesNotExist:
        return Response({'error': 'User not found.'}, status=status.HTTP_404_NOT_FOUND)

    if request.method == 'GET':
        return Response(UserSerializer(user).data)

    elif request.method == 'PATCH':
        serializer = UserSerializer(user, data=request.data, partial=True)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    elif request.method == 'DELETE':
        user.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


@api_view(['POST'])
def reset_user_password(request, user_id):
    """
    POST /api/users/<user_id>/reset-password/
    Body: { "new_password": "..." }
    """
    try:
        user = User.objects.get(user_id=user_id)
    except User.DoesNotExist:
        return Response({'error': 'User not found.'}, status=status.HTTP_404_NOT_FOUND)

    new_password = request.data.get('new_password', '')
    if not new_password or len(new_password) < 6:
        return Response(
            {'error': 'Password must be at least 6 characters.'},
            status=status.HTTP_400_BAD_REQUEST,
        )

    user.password_hash = make_password(new_password)
    user.save()
    return Response({'message': 'Password reset successfully.'})


# ─── Barangays ────────────────────────────────────────────────────────────────

@api_view(['GET'])
def barangays_list(request):
    """GET /api/barangays/ — List all barangays with their assigned spearhead."""
    barangays = Barangay.objects.all().order_by('barangay_name')
    serializer = BarangaySerializer(barangays, many=True)
    return Response(serializer.data)


@api_view(['PATCH'])
def barangay_detail(request, barangay_id):
    """PATCH /api/barangays/<barangay_id>/ — Update a barangay's spearhead assignment."""
    try:
        barangay = Barangay.objects.get(barangay_id=barangay_id)
    except Barangay.DoesNotExist:
        return Response({'error': 'Barangay not found.'}, status=status.HTTP_404_NOT_FOUND)

    serializer = BarangaySerializer(barangay, data=request.data, partial=True)
    if serializer.is_valid():
        serializer.save()
        return Response(serializer.data)
    return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


# ─── Cleanup Requests ─────────────────────────────────────────────────────────

@api_view(['GET', 'POST'])
def cleanup_requests_list(request):
    """
    GET  /api/requests/ — List cleanup requests
        ?role=admin|spearhead&user_id=<id>&status=pending|accepted|rejected|scheduled
    POST /api/requests/ — Create a new cleanup request (multipart for file upload)
    """
    if request.method == 'GET':
        role = request.query_params.get('role', '')
        user_id = request.query_params.get('user_id', '')
        status_filter = request.query_params.get('status', '')

        requests = CleanupRequest.objects.all().order_by('-created_at')

        if role == 'spearhead' and user_id:
            requests = requests.filter(spearhead__user_id=user_id)

        if status_filter:
            requests = requests.filter(status=status_filter)

        serializer = CleanupRequestSerializer(requests, many=True, context={'request': request})
        return Response(serializer.data)

    elif request.method == 'POST':
        spearhead_id = request.data.get('spearhead_id')
        barangay_id = request.data.get('barangay_id')
        description = request.data.get('description', '')
        media_type = request.data.get('media_type', 'image')
        media = request.FILES.get('media')

        try:
            user = User.objects.get(user_id=spearhead_id)
            if user.role != 'spearhead':
                return Response({'error': 'Only spearheads can create requests'}, status=status.HTTP_403_FORBIDDEN)
        except User.DoesNotExist:
            return Response({'error': 'User not found'}, status=status.HTTP_404_NOT_FOUND)

        try:
            barangay = Barangay.objects.get(barangay_id=barangay_id)
        except Barangay.DoesNotExist:
            return Response({'error': 'Barangay not found'}, status=status.HTTP_404_NOT_FOUND)

        cleanup_request = CleanupRequest.objects.create(
            spearhead=user,
            barangay=barangay,
            description=description,
            media_type=media_type,
            media=media,
        )

        serializer = CleanupRequestSerializer(cleanup_request, context={'request': request})
        return Response(serializer.data, status=status.HTTP_201_CREATED)


@api_view(['GET', 'PATCH'])
def cleanup_request_detail(request, request_id):
    """
    GET    /api/requests/<request_id>/ — Retrieve a single request
    PATCH  /api/requests/<request_id>/ — Update status or admin note
    """
    try:
        cleanup_request = CleanupRequest.objects.get(request_id=request_id)
    except CleanupRequest.DoesNotExist:
        return Response({'error': 'Request not found'}, status=status.HTTP_404_NOT_FOUND)

    if request.method == 'GET':
        serializer = CleanupRequestSerializer(cleanup_request, context={'request': request})
        return Response(serializer.data)

    elif request.method == 'PATCH':
        status_action = request.data.get('status')
        admin_note = request.data.get('admin_note')

        if status_action in ['accepted', 'rejected']:
            cleanup_request.status = status_action
            if status_action == 'accepted':
                cleanup_request.accepted_at = timezone.now()
            if admin_note is not None:
                cleanup_request.admin_note = admin_note
            cleanup_request.save()

        serializer = CleanupRequestSerializer(cleanup_request, context={'request': request})
        return Response(serializer.data)


@api_view(['POST'])
def schedule_cleanup(request):
    """
    POST /api/schedule/ — Create a scheduled cleanup with bot assignments
    Body: { request_id?, scheduled_date, bot_ids: [boat_id, ...], barangay_id? }
    """
    request_id = request.data.get('request_id')
    scheduled_date = request.data.get('scheduled_date')
    bot_ids = request.data.get('bot_ids', [])
    barangay_id = request.data.get('barangay_id')

    cleanup_request = None
    if request_id:
        try:
            cleanup_request = CleanupRequest.objects.get(request_id=request_id)
            if cleanup_request.status != 'accepted':
                return Response({'error': 'Only accepted requests can be scheduled'}, status=status.HTTP_400_BAD_REQUEST)
        except CleanupRequest.DoesNotExist:
            return Response({'error': 'Cleanup request not found'}, status=status.HTTP_404_NOT_FOUND)

    if cleanup_request and barangay_id:
        try:
            barangay = Barangay.objects.get(barangay_id=barangay_id)
            cleanup_request.barangay = barangay
            cleanup_request.save()
        except Barangay.DoesNotExist:
            pass

    conflicts = ScheduledBot.objects.filter(
        schedule__scheduled_date=scheduled_date,
        bot__id__in=bot_ids,
    ).values_list('bot__name', flat=True)

    if conflicts:
        return Response({
            'error': f'Bot(s) {list(conflicts)} already scheduled for {scheduled_date}'
        }, status=status.HTTP_400_BAD_REQUEST)

    schedule = ScheduledCleanup.objects.create(
        request=cleanup_request,
        scheduled_date=scheduled_date,
    )

    for bot_id in bot_ids:
        try:
            bot = Boat.objects.get(id=bot_id)
            ScheduledBot.objects.create(schedule=schedule, bot=bot)
        except Boat.DoesNotExist:
            continue

    cleanup_request.status = 'scheduled'
    cleanup_request.save()

    serializer = ScheduledCleanupSerializer(schedule, context={'request': request})
    return Response(serializer.data, status=status.HTTP_201_CREATED)


@api_view(['GET'])
def scheduled_cleanups_list(request):
    """
    GET /api/schedule/ — List scheduled cleanups
        ?date=YYYY-MM-DD&barangay_id=<id>
    """
    date = request.query_params.get('date')
    barangay_id = request.query_params.get('barangay_id')

    schedules = ScheduledCleanup.objects.all().order_by('scheduled_date')

    if date:
        schedules = schedules.filter(scheduled_date=date)
    if barangay_id:
        schedules = schedules.filter(request__barangay__barangay_id=barangay_id)

    serializer = ScheduledCleanupSerializer(schedules, many=True, context={'request': request})
    return Response(serializer.data)


@api_view(['GET'])
def available_slots(request):
    """
    GET /api/schedule/available-slots/ — Get dates with accepted requests for scheduling
    """
    accepted_requests = CleanupRequest.objects.filter(status='accepted').order_by('accepted_at')
    dates = accepted_requests.values_list('accepted_at__date', flat=True).distinct()
    # Also include all future dates that have no schedules yet for accepted requests
    result = []
    for d in dates:
        result.append(str(d))
    return Response(result)
